import type {
  Agent,
  AletheiaLogger,
  AletheiaLogLevel,
  AletheiaEventType,
  AletheiaEventHandler,
} from "@a2aletheia/sdk";
import type {
  AgentCard,
  AgentSkill,
  AgentCapabilities,
  A2AResponse,
} from "@a2a-js/sdk";
import type { TaskStore, A2ARequestHandler } from "@a2a-js/sdk/server";
import {
  AletheiaAgent,
  type AletheiaAgentConfig,
  type AletheiaExtensions,
  type AgentHandler,
  type CancelHandler,
} from "@a2aletheia/sdk/agent";
import { AletheiaA2A } from "./aletheia-a2a.js";
import type {
  AgentSelector,
  MessageInput,
  SendOptions,
  TrustedResponse,
  TrustedStreamEvent,
} from "./types.js";
import type { TrustedAgent } from "./trusted-agent.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PeerAgentConfig {
  // Shared
  registryUrl?: string;

  // Server-side (AletheiaAgent)
  name: string;
  version: string;
  url: string;
  description: string;
  skills: AgentSkill[];
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  capabilities?: Partial<AgentCapabilities>;
  iconUrl?: string;
  documentationUrl?: string;
  provider?: { organization: string; url: string };
  aletheiaExtensions?: AletheiaExtensions;
  taskStore?: TaskStore;

  // Client-side (AletheiaA2A)
  agentSelector?: AgentSelector;
  minTrustScore?: number;
  requireLive?: boolean;
  livenessCheckBeforeSend?: boolean;
  verifyIdentity?: boolean;
  authToken?: string;

  // Observability (BYOL)
  logger?: AletheiaLogger;
  logLevel?: AletheiaLogLevel;
}

// ---------------------------------------------------------------------------
// PeerAgent
// ---------------------------------------------------------------------------

/**
 * A full-duplex peer that can both host an A2A agent (inbound) and
 * send trust-verified requests to other agents (outbound).
 *
 * Composes `AletheiaAgent` (server) + `AletheiaA2A` (client).
 *
 * @example
 * ```typescript
 * import { PeerAgent } from "@a2aletheia/a2a";
 *
 * const peer = new PeerAgent({
 *   registryUrl: "https://registry.aletheia.dev",
 *   name: "Orchestrator",
 *   version: "1.0.0",
 *   url: "https://orchestrator.example.com",
 *   description: "Routes work to specialist agents",
 *   skills: [{ id: "orchestrate", name: "orchestrate", description: "Orchestrate tasks", tags: [] }],
 *   minTrustScore: 0.7,
 * });
 *
 * peer.handle(async (context, response) => {
 *   // Use outbound client inside the handler
 *   const result = await peer.sendByCapability("translate", context.textContent);
 *   response.text(result.response);
 * });
 *
 * await peer.start(4000);
 * ```
 */
export class PeerAgent {
  private readonly agent: AletheiaAgent;
  private readonly client: AletheiaA2A;

  constructor(config: PeerAgentConfig) {
    const agentConfig: AletheiaAgentConfig = {
      name: config.name,
      version: config.version,
      url: config.url,
      description: config.description,
      skills: config.skills,
      defaultInputModes: config.defaultInputModes,
      defaultOutputModes: config.defaultOutputModes,
      capabilities: config.capabilities,
      iconUrl: config.iconUrl,
      documentationUrl: config.documentationUrl,
      provider: config.provider,
      aletheiaExtensions: config.aletheiaExtensions,
      registryUrl: config.registryUrl,
      taskStore: config.taskStore,
      logger: config.logger,
      logLevel: config.logLevel,
    };

    this.agent = new AletheiaAgent(agentConfig);

    this.client = new AletheiaA2A({
      registryUrl: config.registryUrl,
      agentSelector: config.agentSelector,
      minTrustScore: config.minTrustScore,
      requireLive: config.requireLive,
      livenessCheckBeforeSend: config.livenessCheckBeforeSend,
      verifyIdentity: config.verifyIdentity,
      authToken: config.authToken,
      logger: config.logger,
      logLevel: config.logLevel,
    });
  }

  // ---------------------------------------------------------------------------
  // Inbound (delegated to AletheiaAgent)
  // ---------------------------------------------------------------------------

  /**
   * Register the message handler for incoming requests.
   */
  handle(handler: AgentHandler): this {
    this.agent.handle(handler);
    return this;
  }

  /**
   * Register an optional cancel handler.
   */
  onCancel(handler: CancelHandler): this {
    this.agent.onCancel(handler);
    return this;
  }

  /**
   * Handle a JSON-RPC request body (framework-agnostic).
   */
  async handleRequest(
    body: unknown,
  ): Promise<A2AResponse | AsyncGenerator<A2AResponse, void, undefined>> {
    return this.agent.handleRequest(body);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle event hooks
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to lifecycle events. Returns an unsubscribe function.
   */
  on(
    event: AletheiaEventType | "*",
    handler: AletheiaEventHandler,
  ): () => void {
    return this.agent.on(event, handler);
  }

  // ---------------------------------------------------------------------------
  // Outbound (delegated to AletheiaA2A)
  // ---------------------------------------------------------------------------

  /**
   * Discover agents by capability, query, or trust criteria.
   */
  async discover(params: {
    capability?: string;
    query?: string;
    isLive?: boolean;
    minTrustScore?: number;
    limit?: number;
  }): Promise<Agent[]> {
    return this.client.discover(params);
  }

  /**
   * Connect to an agent by DID with trust verification.
   */
  async connect(did: string): Promise<TrustedAgent> {
    return this.client.connect(did);
  }

  /**
   * Connect to an agent by URL (no trust verification).
   */
  async connectByUrl(url: string): Promise<TrustedAgent> {
    return this.client.connectByUrl(url);
  }

  /**
   * Discover, select, and send a message by capability.
   */
  async sendByCapability(
    capability: string,
    input: string | MessageInput,
    options?: SendOptions,
  ): Promise<TrustedResponse> {
    return this.client.sendByCapability(capability, input, options);
  }

  /**
   * Discover, select, and stream a response by capability.
   */
  async *streamByCapability(
    capability: string,
    input: string | MessageInput,
    options?: SendOptions,
  ): AsyncGenerator<TrustedStreamEvent> {
    yield* this.client.streamByCapability(capability, input, options);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Start a standalone Express server.
   */
  async start(port: number): Promise<void> {
    return this.agent.start(port);
  }

  /**
   * Stop the standalone server if running.
   */
  stop(): void {
    this.agent.stop();
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /**
   * Get the agent's AgentCard.
   */
  getAgentCard(): AgentCard {
    return this.agent.getAgentCard();
  }

  /**
   * Get the underlying request handler for custom integrations.
   */
  getRequestHandler(): A2ARequestHandler {
    return this.agent.getRequestHandler();
  }

  /**
   * Get the task store.
   */
  getTaskStore(): TaskStore {
    return this.agent.getTaskStore();
  }

  /**
   * Get Aletheia-specific extensions.
   */
  getAletheiaExtensions(): AletheiaExtensions | undefined {
    return this.agent.getAletheiaExtensions();
  }

  /**
   * Get the underlying AletheiaAgent (escape hatch).
   */
  getAgent(): AletheiaAgent {
    return this.agent;
  }

  /**
   * Get the underlying AletheiaA2A client (escape hatch).
   */
  getClient(): AletheiaA2A {
    return this.client;
  }
}
