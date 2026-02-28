import type { Agent, AletheiaLogger } from "@a2aletheia/sdk";
import { AletheiaClient, ConsoleLogger, resolveApiUrl } from "@a2aletheia/sdk";
import {
  ClientFactory,
  ClientFactoryOptions,
  type Client,
  JsonRpcTransportFactory,
  RestTransportFactory,
  createAuthenticatingFetchWithRetry,
} from "@a2a-js/sdk/client";
import { AGENT_CARD_PATH } from "@a2a-js/sdk";
import type {
  AletheiaA2AConfig,
  AgentSelector,
  MessageInput,
  SendOptions,
  TrustedResponse,
  TrustedStreamEvent,
} from "./types.js";
import { buildTrustInfo } from "./types.js";
import { HighestTrustSelector } from "./agent-selector.js";
import {
  buildPipelineConfig,
  verifySendPreconditions,
  type TrustPipelineConfig,
} from "./trust-pipeline.js";
import { TrustedAgent } from "./trusted-agent.js";
import { AgentNotFoundError } from "./errors.js";

async function createTransportFactories(
  authHandler?: AletheiaA2AConfig["authenticationHandler"],
): Promise<(JsonRpcTransportFactory | RestTransportFactory)[]> {
  const factories: (JsonRpcTransportFactory | RestTransportFactory)[] = [];

  if (authHandler) {
    const authFetch = createAuthenticatingFetchWithRetry(fetch, authHandler);
    factories.push(new JsonRpcTransportFactory({ fetchImpl: authFetch }));
    factories.push(new RestTransportFactory({ fetchImpl: authFetch }));
  } else {
    factories.push(new JsonRpcTransportFactory());
    factories.push(new RestTransportFactory());
  }

  return factories;
}

async function fetchAgentCard(url: string): Promise<import("@a2a-js/sdk").AgentCard> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch agent card: ${response.status}`);
  }
  return response.json();
}

export class AletheiaA2A {
  private readonly aletheiaClient: AletheiaClient;
  private readonly selector: AgentSelector;
  private readonly pipelineConfig: TrustPipelineConfig;
  readonly logger: AletheiaLogger;

  private readonly _clientFactory: ClientFactory;

  /**
   * Cache of connected agents keyed by DID.
   * Reusing a TrustedAgent preserves conversation context (contextId/taskId).
   */
  private readonly _connectionCache = new Map<string, TrustedAgent>();

  /** Cache of URL-connected agents (no DID lookup). */
  private readonly _urlConnectionCache = new Map<string, TrustedAgent>();

  constructor(private readonly config: AletheiaA2AConfig = {}) {
    this.logger = config.logger ?? new ConsoleLogger(config.logLevel ?? "info");

    if (config.signOutboundMessages && !config.signingIdentity) {
      throw new Error(
        "signOutboundMessages requires signingIdentity to be provided",
      );
    }

    this.aletheiaClient = new AletheiaClient({
      apiUrl: resolveApiUrl(config.registryUrl),
    });

    if (config.authToken) {
      this.aletheiaClient.setAuthToken(config.authToken);
    }

    this.selector = config.agentSelector ?? new HighestTrustSelector();
    this.pipelineConfig = buildPipelineConfig(config);

    this._clientFactory = this._createClientFactory();
  }

  private _createClientFactory(): ClientFactory {
    const options = ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      clientConfig: {
        interceptors: this.config.interceptors,
        polling: this.config.polling,
      },
      preferredTransports: this.config.preferredTransports,
    });

    return new ClientFactory(options);
  }

  async _createClientFromUrl(url: string): Promise<Client> {
    const agentCard = await fetchAgentCard(url);
    const transports = await createTransportFactories(this.config.authenticationHandler);
    const options = ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      transports,
      clientConfig: {
        interceptors: this.config.interceptors,
        polling: this.config.polling,
      },
      preferredTransports: this.config.preferredTransports,
    });

    const factory = new ClientFactory(options);
    return factory.createFromAgentCard(agentCard);
  }

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  async discover(params: {
    capability?: string;
    query?: string;
    queryEmbedding?: number[];
    isLive?: boolean;
    minTrustScore?: number;
    limit?: number;
  }): Promise<Agent[]> {
    this.logger.debug("Discovering agents", params);

    const result = await this.aletheiaClient.discoverAgents({
      capability: params.capability,
      query: params.query,
      queryEmbedding: params.queryEmbedding,
      isLive: params.isLive ?? (this.pipelineConfig.requireLive ? true : false),
      minTrustScore:
        params.minTrustScore ??
        (this.pipelineConfig.minTrustScore || undefined),
      limit: params.limit,
    });

    this.logger.debug("Discovery result", { count: result.items.length });
    return result.items;
  }

  // ---------------------------------------------------------------------------
  // Connection-based API
  // ---------------------------------------------------------------------------

  async connect(did: string): Promise<TrustedAgent> {
    const cached = this._connectionCache.get(did);
    if (cached) {
      this.logger.debug("Reusing cached connection, refreshing trust", { did });
      const freshAgent = await this.aletheiaClient.getAgent(did);
      cached.agent = freshAgent;
      cached.trustInfo = buildTrustInfo(freshAgent);
      return cached;
    }

    this.logger.debug("Connecting to agent", { did });
    const agent = await this.aletheiaClient.getAgent(did);
    return this._connectAgent(agent);
  }

  async connectByUrl(
    url: string,
    options?: { scope?: string },
  ): Promise<TrustedAgent> {
    const cacheKey = options?.scope ? `${url}#${options.scope}` : url;

    const cached = this._urlConnectionCache.get(cacheKey);
    if (cached) {
      this.logger.debug("Reusing cached URL connection", {
        url,
        scope: options?.scope,
      });
      return cached;
    }

    this.logger.debug("Connecting to agent by URL", {
      url,
      scope: options?.scope,
    });
    
    const agentCardUrl = this._toAgentCardUrl(url);
    const a2aClient = await this._createClientFromUrl(agentCardUrl);
    const agentCard = await a2aClient.getAgentCard();
    const trustInfo = buildTrustInfo(null);

    const storeKey = options?.scope ? `${options.scope}:${url}` : `url:${url}`;

    const trustedAgent = new TrustedAgent({
      a2aClient,
      agentCard,
      agent: null,
      trustInfo,
      contextStore: this.config.contextStore,
      storeKey,
      signingIdentity: this.config.signingIdentity
        ? this.config.signingIdentity
        : undefined,
    });

    if (this.config.contextStore) {
      await trustedAgent.restoreContext();
    }

    this._urlConnectionCache.set(cacheKey, trustedAgent);
    return trustedAgent;
  }

  // ---------------------------------------------------------------------------
  // High-level send/stream
  // ---------------------------------------------------------------------------

  async sendByCapability(
    capability: string,
    input: string | MessageInput,
    options?: SendOptions,
  ): Promise<TrustedResponse> {
    const agent = await this._discoverAndSelect(capability);
    const trustedAgent = await this._connectAgent(agent);
    return trustedAgent.send(input, options);
  }

  async *streamByCapability(
    capability: string,
    input: string | MessageInput,
    options?: SendOptions,
  ): AsyncGenerator<TrustedStreamEvent> {
    const agent = await this._discoverAndSelect(capability);
    const trustedAgent = await this._connectAgent(agent);
    yield* trustedAgent.stream(input, options);
  }

  // ---------------------------------------------------------------------------
  // Cache management
  // ---------------------------------------------------------------------------

  /**
   * Clear cached connections. Next send/connect will create fresh connections.
   */
  clearConnections(): void {
    this._connectionCache.clear();
    this._urlConnectionCache.clear();
  }

  /**
   * Clear the cached connection for a specific DID.
   */
  disconnectAgent(did: string): void {
    this._connectionCache.delete(did);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _toAgentCardUrl(baseUrl: string): string {
    const path = `/${AGENT_CARD_PATH.replace(/^\//, "")}`;
    return new URL(path, baseUrl.replace(/\/$/, "") + "/").toString();
  }

  private async _discoverAndSelect(capability: string): Promise<Agent> {
    const agents = await this.discover({ capability });

    if (agents.length === 0) {
      throw new AgentNotFoundError(
        `No agents found with capability "${capability}"`,
      );
    }

    return this.selector.select(agents);
  }

  private async _connectAgent(agent: Agent): Promise<TrustedAgent> {
    if (agent.did) {
      const cached = this._connectionCache.get(agent.did);
      if (cached) {
        this.logger.debug("Reusing cached connection, refreshing trust", {
          did: agent.did,
        });
        await verifySendPreconditions(
          agent,
          this.aletheiaClient,
          this.pipelineConfig,
          this.logger,
        );
        cached.agent = agent;
        cached.trustInfo = buildTrustInfo(agent);
        return cached;
      }
    }

    const trustInfo = await verifySendPreconditions(
      agent,
      this.aletheiaClient,
      this.pipelineConfig,
      this.logger,
    );

    const agentCardUrl = this._toAgentCardUrl(agent.url);
    const a2aClient = await this._createClientFromUrl(agentCardUrl);
    const agentCard = await a2aClient.getAgentCard();

    this.logger.info("Connected to agent", {
      did: agent.did,
      name: agent.name,
    });

    const storeKey = agent.did ? `did:${agent.did}` : undefined;
    const trustedAgent = new TrustedAgent({
      a2aClient,
      agentCard,
      agent,
      trustInfo,
      contextStore: storeKey ? this.config.contextStore : undefined,
      storeKey,
      aletheiaClient: this.aletheiaClient,
      signingIdentity: this.config.signOutboundMessages
        ? this.config.signingIdentity
        : undefined,
    });

    if (this.config.contextStore && storeKey) {
      await trustedAgent.restoreContext();
    }

    if (agent.did) {
      this._connectionCache.set(agent.did, trustedAgent);
    }

    return trustedAgent;
  }
}
