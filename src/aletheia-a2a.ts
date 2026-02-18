import type { Agent, AletheiaLogger } from "@a2aletheia/sdk";
import { AletheiaClient, ConsoleLogger, resolveApiUrl } from "@a2aletheia/sdk";
import { A2AClient } from "@a2a-js/sdk/client";
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

export class AletheiaA2A {
  private readonly aletheiaClient: AletheiaClient;
  private readonly selector: AgentSelector;
  private readonly pipelineConfig: TrustPipelineConfig;
  readonly logger: AletheiaLogger;

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
  }

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  async discover(params: {
    capability?: string;
    query?: string;
    isLive?: boolean;
    minTrustScore?: number;
    limit?: number;
  }): Promise<Agent[]> {
    this.logger.debug("Discovering agents", params);

    const result = await this.aletheiaClient.discoverAgents({
      capability: params.capability,
      query: params.query,
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
    // For cached connections, fetch fresh agent data and update trust info
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
    // Scope isolates context per-caller (e.g. per chat session).
    // Without scope, all callers share one conversation context — wrong for multi-user.
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
    const a2aClient = new A2AClient(url);
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
      signingIdentity: this.config.signOutboundMessages
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
    // Return cached connection with refreshed trust data
    if (agent.did) {
      const cached = this._connectionCache.get(agent.did);
      if (cached) {
        this.logger.debug("Reusing cached connection, refreshing trust", {
          did: agent.did,
        });
        // Re-verify preconditions with fresh agent data
        await verifySendPreconditions(
          agent,
          this.aletheiaClient,
          this.pipelineConfig,
          this.logger,
        );
        // Update the cached agent's trust info
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

    const a2aClient = new A2AClient(agent.url);
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

    // Cache the connection by DID
    if (agent.did) {
      this._connectionCache.set(agent.did, trustedAgent);
    }

    return trustedAgent;
  }
}
