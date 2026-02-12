import type { Agent, AletheiaLogger, AletheiaLogLevel } from "@a2aletheia/sdk";
import type {
  Message,
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  Part,
} from "@a2a-js/sdk";

// ---------------------------------------------------------------------------
// Re-exports — consumers never need to import @a2a-js/sdk directly
// ---------------------------------------------------------------------------

export type {
  AgentCard,
  Message,
  Task,
  TaskState,
  TaskStatus,
  Part,
  TextPart,
  FilePart,
  DataPart,
  Artifact,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  MessageSendParams,
  MessageSendConfiguration,
} from "@a2a-js/sdk";

export type { A2AClient } from "@a2a-js/sdk/client";

// A2AStreamEventData is not exported from @a2a-js/sdk/client, so we define it
export type A2AStreamEventData =
  | Message
  | Task
  | TaskStatusUpdateEvent
  | TaskArtifactUpdateEvent;

// ---------------------------------------------------------------------------
// Context persistence
// ---------------------------------------------------------------------------

/** Stored conversation state for a single agent connection. */
export interface StoredContext {
  contextId?: string;
  taskId?: string;
}

/**
 * Pluggable store for persisting A2A conversation context across process
 * restarts / serverless cold-starts.  Implement this with Redis, a database,
 * or any async key-value store.
 */
export interface ContextStore {
  get(key: string): Promise<StoredContext | null>;
  set(key: string, data: StoredContext): Promise<void>;
  delete(key: string): Promise<void>;
}

// Re-export RedisLike from SDK so existing consumers aren't broken
export type { RedisLike } from "@a2aletheia/sdk/agent";

// ---------------------------------------------------------------------------
// Package-specific types
// ---------------------------------------------------------------------------

export interface AletheiaA2AConfig {
  registryUrl?: string;
  agentSelector?: AgentSelector;
  minTrustScore?: number;
  requireLive?: boolean;
  livenessCheckBeforeSend?: boolean;
  verifyIdentity?: boolean;
  authToken?: string;
  logger?: AletheiaLogger;
  logLevel?: AletheiaLogLevel;
  /** Optional store for persisting conversation context (contextId/taskId). */
  contextStore?: ContextStore;
}

export interface AgentSelector {
  select(agents: Agent[]): Agent;
}

export interface MessageInput {
  text?: string;
  data?: Record<string, unknown>;
  parts?: Part[];
  contextId?: string;
  taskId?: string;
}

export interface SendOptions {
  acceptedOutputModes?: string[];
  blocking?: boolean;
  contextId?: string;
  taskId?: string;
  timeoutMs?: number;
}

export interface TrustInfo {
  didVerified: boolean;
  isLive: boolean;
  trustScore: number | null;
  isBattleTested: boolean;
  responseVerified: boolean | null;
  verifiedAt: Date;
}

export interface TrustedResponse {
  response: Task | Message;
  trustInfo: TrustInfo;
  agentDid: string | null;
  agentName: string;
  duration: number;
}

export interface TrustedStreamEvent {
  event: A2AStreamEventData;
  kind: "message" | "task" | "status-update" | "artifact-update";
  agentDid: string | null;
  trustInfo: TrustInfo;
}

export interface TrustedTaskResponse {
  response: Task;
  trustInfo: TrustInfo;
  agentDid: string | null;
  agentName: string;
}

// ---------------------------------------------------------------------------
// Helpers (internal)
// ---------------------------------------------------------------------------

export function buildTrustInfo(agent: Agent | null): TrustInfo {
  if (!agent) {
    return {
      didVerified: false,
      isLive: false,
      trustScore: null,
      isBattleTested: false,
      responseVerified: null,
      verifiedAt: new Date(),
    };
  }
  return {
    didVerified: true,
    isLive: agent.isLive,
    trustScore: agent.trustScore,
    isBattleTested: agent.isBattleTested,
    responseVerified: null, // Phase 2+
    verifiedAt: new Date(),
  };
}

export function buildMessageParts(input: string | MessageInput): {
  parts: Part[];
  contextId?: string;
  taskId?: string;
} {
  if (typeof input === "string") {
    return {
      parts: [{ kind: "text" as const, text: input }],
    };
  }

  const parts: Part[] = [];

  if (input.text) {
    parts.push({ kind: "text" as const, text: input.text });
  }
  if (input.data) {
    parts.push({ kind: "data" as const, data: input.data });
  }
  if (input.parts) {
    parts.push(...input.parts);
  }

  return {
    parts,
    contextId: input.contextId,
    taskId: input.taskId,
  };
}

export function buildMessageSendParams(
  input: string | MessageInput,
  options?: SendOptions,
) {
  const { parts, contextId, taskId } = buildMessageParts(input);

  return {
    message: {
      kind: "message" as const,
      role: "user" as const,
      messageId: crypto.randomUUID(),
      parts,
      contextId: options?.contextId ?? contextId,
      taskId: options?.taskId ?? taskId,
    },
    configuration: {
      acceptedOutputModes: options?.acceptedOutputModes ?? [
        "text/plain",
        "application/json",
      ],
      blocking: options?.blocking,
    },
  };
}
