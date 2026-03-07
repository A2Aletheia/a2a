import type { Agent, AletheiaClient } from "@a2aletheia/sdk";
import type { AgentCard, Task, TaskPushNotificationConfig } from "@a2a-js/sdk";
import type { Client } from "@a2a-js/sdk/client";
import type {
  TrustInfo,
  TrustedResponse,
  TrustedStreamEvent,
  TrustedTaskResponse,
  MessageInput,
  SendOptions,
  ContextStore,
  AgentSigningIdentity,
  UserDelegationEnvelope,
} from "./types.js";
import { buildTrustInfo, buildMessageSendParams } from "./types.js";
import { A2AProtocolError } from "./errors.js";
import { extractFlowRequest } from "./flow-types.js";

export class TrustedAgent {
  readonly did: string | null;
  agent: Agent | null;
  readonly agentCard: AgentCard;
  trustInfo: TrustInfo;

  /** @internal */
  readonly _a2aClient: Client;

  /**
   * Tracked conversation state — populated after the first send/stream.
   * Subsequent calls reuse these to continue the same conversation.
   */
  private _contextId: string | undefined;
  private _lastTaskId: string | undefined;

  /** Optional persistent store + key for surviving cold-starts. */
  private readonly _contextStore: ContextStore | undefined;
  private readonly _storeKey: string | undefined;

  /** Registry client for refreshing trust data. */
  private readonly _aletheiaClient: AletheiaClient | undefined;

  /** Signing identity for Layer 1 outbound signing. */
  private readonly _signingIdentity: AgentSigningIdentity | undefined;

  /** User delegation envelope for Layer 2 user identity. */
  private _userDelegation: UserDelegationEnvelope | undefined;

  constructor(opts: {
    a2aClient: Client;
    agentCard: AgentCard;
    agent: Agent | null;
    trustInfo: TrustInfo;
    contextStore?: ContextStore;
    storeKey?: string;
    aletheiaClient?: AletheiaClient;
    signingIdentity?: AgentSigningIdentity;
  }) {
    this._a2aClient = opts.a2aClient;
    this.agentCard = opts.agentCard;
    this.agent = opts.agent;
    this.did = opts.agent?.did ?? null;
    this.trustInfo = opts.trustInfo;
    this._contextStore = opts.contextStore;
    this._storeKey = opts.storeKey;
    this._aletheiaClient = opts.aletheiaClient;
    this._signingIdentity = opts.signingIdentity;
  }

  /**
   * Attach a user delegation envelope to all subsequent outbound messages.
   * Call with `null` to clear.
   */
  setUserDelegation(delegation: UserDelegationEnvelope | null): void {
    this._userDelegation = delegation ?? undefined;
  }

  /**
   * Restore conversation context from the persistent store.
   * Called by `AletheiaA2A` after constructing a new `TrustedAgent`.
   */
  async restoreContext(): Promise<void> {
    if (!this._contextStore || !this._storeKey) return;
    const stored = await this._contextStore.get(this._storeKey);
    if (stored) {
      this._contextId = stored.contextId;
      this._lastTaskId = stored.taskId;
    }
  }

  get supportsStreaming(): boolean {
    return this.agentCard.capabilities?.streaming === true;
  }

  get supportsPushNotifications(): boolean {
    return this.agentCard.capabilities?.pushNotifications === true;
  }

  /** The contextId from the most recent exchange, if any. */
  get contextId(): string | undefined {
    return this._contextId;
  }

  /** The taskId from the most recent exchange, if any. */
  get lastTaskId(): string | undefined {
    return this._lastTaskId;
  }

  async send(
    input: string | MessageInput,
    options?: SendOptions,
  ): Promise<TrustedResponse> {
    const params = await buildMessageSendParams(input, {
      ...options,
      contextId: options?.contextId ?? this._contextId,
      taskId: options?.taskId ?? this._lastTaskId,
      blocking: options?.blocking ?? true,
      signingIdentity: this._signingIdentity,
      userDelegation: this._userDelegation,
    });

    const start = Date.now();
    let result:
      | Task
      | {
          kind: "message";
          taskId?: string;
          contextId?: string;
          metadata?: Record<string, unknown>;
        };
    try {
      result = await this._a2aClient.sendMessage(params);
    } catch (err) {
      if (err && typeof err === "object" && "code" in err) {
        throw new A2AProtocolError(
          (err as { message?: string }).message ?? "A2A protocol error",
          { rpcCode: (err as { code: number }).code },
        );
      }
      throw err;
    }
    const duration = Date.now() - start;

    if (result.kind === "task") {
      this._lastTaskId = result.id;
      this._contextId = result.contextId;
    } else {
      if ("taskId" in result && typeof result.taskId === "string") {
        this._lastTaskId = result.taskId;
      }
      if ("contextId" in result && typeof result.contextId === "string") {
        this._contextId = result.contextId;
      }
    }

    this._persistContext();

    const metadata = (result as { metadata?: Record<string, unknown> })
      .metadata;
    const flowRequest = extractFlowRequest(metadata) ?? undefined;

    return {
      response: result as Task,
      trustInfo: this.trustInfo,
      agentDid: this.did,
      agentName: this.agent?.name ?? this.agentCard.name,
      duration,
      flowRequest,
    };
  }

  async *stream(
    input: string | MessageInput,
    options?: SendOptions,
  ): AsyncGenerator<TrustedStreamEvent> {
    const params = await buildMessageSendParams(input, {
      ...options,
      contextId: options?.contextId ?? this._contextId,
      taskId: options?.taskId ?? this._lastTaskId,
      blocking: options?.blocking ?? false,
      signingIdentity: this._signingIdentity,
      userDelegation: this._userDelegation,
    });

    const eventStream = this._a2aClient.sendMessageStream(params);

    for await (const event of eventStream) {
      if (event.kind === "task") {
        this._lastTaskId = event.id;
        this._contextId = event.contextId;
      } else {
        if (
          "taskId" in event &&
          typeof event.taskId === "string" &&
          !this._lastTaskId
        ) {
          this._lastTaskId = event.taskId;
        }
        if (
          "contextId" in event &&
          typeof event.contextId === "string" &&
          !this._contextId
        ) {
          this._contextId = event.contextId;
        }
      }

      this._persistContext();

      yield {
        event,
        kind: event.kind as TrustedStreamEvent["kind"],
        agentDid: this.did,
        trustInfo: this.trustInfo,
      };
    }
  }

  async getTask(taskId: string): Promise<TrustedTaskResponse> {
    let task: Task;
    try {
      task = await this._a2aClient.getTask({ id: taskId });
    } catch (err) {
      if (err && typeof err === "object" && "code" in err) {
        throw new A2AProtocolError(
          (err as { message?: string }).message ?? "Failed to get task",
          { rpcCode: (err as { code: number }).code },
        );
      }
      throw err;
    }

    return {
      response: task,
      trustInfo: this.trustInfo,
      agentDid: this.did,
      agentName: this.agent?.name ?? this.agentCard.name,
    };
  }

  async cancelTask(taskId: string): Promise<TrustedTaskResponse> {
    let task: Task;
    try {
      task = await this._a2aClient.cancelTask({ id: taskId });
    } catch (err) {
      if (err && typeof err === "object" && "code" in err) {
        throw new A2AProtocolError(
          (err as { message?: string }).message ?? "Failed to cancel task",
          { rpcCode: (err as { code: number }).code },
        );
      }
      throw err;
    }

    return {
      response: task,
      trustInfo: this.trustInfo,
      agentDid: this.did,
      agentName: this.agent?.name ?? this.agentCard.name,
    };
  }

  async *resubscribeTask(taskId: string): AsyncGenerator<TrustedStreamEvent> {
    const eventStream = this._a2aClient.resubscribeTask({ id: taskId });

    for await (const event of eventStream) {
      yield {
        event,
        kind: event.kind as TrustedStreamEvent["kind"],
        agentDid: this.did,
        trustInfo: this.trustInfo,
      };
    }
  }

  async setTaskPushNotificationConfig(
    config: TaskPushNotificationConfig,
  ): Promise<TaskPushNotificationConfig> {
    return this._a2aClient.setTaskPushNotificationConfig(config);
  }

  async getTaskPushNotificationConfig(
    taskId: string,
  ): Promise<TaskPushNotificationConfig> {
    return this._a2aClient.getTaskPushNotificationConfig({ id: taskId });
  }

  async listTaskPushNotificationConfig(
    taskId: string,
  ): Promise<TaskPushNotificationConfig[]> {
    return this._a2aClient.listTaskPushNotificationConfig({ id: taskId });
  }

  async deleteTaskPushNotificationConfig(
    taskId: string,
    configId: string,
  ): Promise<void> {
    await this._a2aClient.deleteTaskPushNotificationConfig({
      id: taskId,
      pushNotificationConfigId: configId,
    });
  }

  async refreshCard(): Promise<AgentCard> {
    const card = await this._a2aClient.getAgentCard();
    (this as { agentCard: AgentCard }).agentCard = card;
    return card;
  }

  /**
   * Re-fetch the agent from the registry and update trust info.
   * Call this to get fresh isLive, trustScore, isBattleTested values.
   */
  async refreshTrust(): Promise<TrustInfo> {
    if (!this.did || !this._aletheiaClient) {
      return this.trustInfo;
    }

    const freshAgent = await this._aletheiaClient.getAgent(this.did);
    this.agent = freshAgent;
    this.trustInfo = buildTrustInfo(freshAgent);
    return this.trustInfo;
  }

  /**
   * Reset conversation state. Next send() starts a fresh conversation.
   */
  resetContext(): void {
    this._contextId = undefined;
    this._lastTaskId = undefined;
    if (this._contextStore && this._storeKey) {
      this._contextStore.delete(this._storeKey).catch(() => {});
    }
  }

  /** Fire-and-forget persist of current context to the store. */
  private _persistContext(): void {
    if (!this._contextStore || !this._storeKey) return;
    if (!this._contextId && !this._lastTaskId) return;
    this._contextStore
      .set(this._storeKey, {
        contextId: this._contextId,
        taskId: this._lastTaskId,
      })
      .catch(() => {});
  }
}
