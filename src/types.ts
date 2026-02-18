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
// Sender identity extension (Layer 1 — Agent-to-Agent)
// ---------------------------------------------------------------------------

/** Well-known extension URI for Aletheia sender identity. */
export const SENDER_IDENTITY_EXTENSION = "urn:aletheia:sender-identity:v1";

/** Signing credentials for the local agent (Ed25519). */
export interface AgentSigningIdentity {
  /** Agent's DID (did:key:z6Mk... or did:web:...) */
  did: string;
  /** Ed25519 private key (hex string) */
  privateKey: string;
}

/** Identity envelope attached to outbound messages via metadata. */
export interface SenderIdentityEnvelope {
  /** DID of the sender agent */
  senderDid: string;
  /** Ed25519 signature (hex string) */
  signature: string;
  /** Unix timestamp (ms) when the message was signed */
  timestamp: number;
  /** The messageId that was signed — binds signature to this specific message */
  messageId: string;
}

/** Result of verifying an inbound message's sender identity. */
export interface VerifiedSender {
  /** The sender's DID */
  did: string;
  /** Whether the Ed25519 signature was cryptographically valid */
  signatureValid: boolean;
  /** Whether the DID document was successfully resolved */
  didResolved: boolean;
  /** Timestamp from the sender's signature */
  signedAt: number;
}

// ---------------------------------------------------------------------------
// User delegation extension (Layer 2 — User-to-Agent)
// ---------------------------------------------------------------------------

/** Well-known extension URI for Aletheia user delegation. */
export const USER_DELEGATION_EXTENSION = "urn:aletheia:user-delegation:v1";

/** What the user signs via MetaMask (EIP-712 typed data). */
export interface UserDelegation {
  /** User's Ethereum address */
  userAddress: string;
  /** The agent's DID being delegated to */
  delegateDid: string;
  /** Scope of delegation (e.g. "hotel-booking", "*" for all) */
  scope: string;
  /** Expiration timestamp (unix seconds) */
  exp: bigint;
  /** Nonce to prevent replay */
  nonce: string;
}

/** Envelope carrying user delegation in message metadata. */
export interface UserDelegationEnvelope {
  delegation: UserDelegation;
  /** EIP-712 signature from user's wallet (hex string) */
  signature: string;
}

/** Result of verifying an inbound user delegation. */
export interface VerifiedUser {
  /** Recovered user address */
  address: string;
  /** Agent DID this delegation was issued to */
  delegatedTo: string;
  /** Scope of delegation */
  scope: string;
  /** Whether the delegation is fully valid (signature + not expired + delegate matches) */
  valid: boolean;
  /** Whether the delegation has expired */
  expired: boolean;
}

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

  // --- Sender identity (Layer 1) ---

  /** Sign outbound messages with the agent's Ed25519 key. Requires `signingIdentity`. */
  signOutboundMessages?: boolean;
  /** Agent's signing identity (DID + private key). Required when `signOutboundMessages` is true. */
  signingIdentity?: AgentSigningIdentity;
  /** Verify sender identity on inbound messages. */
  verifySenderIdentity?: boolean;
  /** Reject unsigned inbound messages. Only effective when `verifySenderIdentity` is true. */
  requireSignedMessages?: boolean;
  /** Maximum age (ms) for accepting signed messages. Default: 300_000 (5 minutes). */
  maxMessageAge?: number;

  // --- User delegation (Layer 2) ---

  /** Verify user delegation proofs on inbound messages. */
  verifyUserDelegation?: boolean;
  /** Reject messages without valid user delegation. Only effective when `verifyUserDelegation` is true. */
  requireUserDelegation?: boolean;
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

export async function buildMessageSendParams(
  input: string | MessageInput,
  options?: SendOptions & {
    signingIdentity?: AgentSigningIdentity;
    userDelegation?: UserDelegationEnvelope;
  },
) {
  const { parts, contextId, taskId } = buildMessageParts(input);
  const messageId = crypto.randomUUID();

  // Build metadata with optional identity extensions
  let metadata: Record<string, unknown> | undefined;

  if (options?.signingIdentity) {
    // Lazy import to avoid circular deps
    const { createSenderEnvelope, computePartsDigest } = await import(
      "./sender-identity.js"
    );
    const digest = await computePartsDigest(parts);
    const envelope = await createSenderEnvelope(
      messageId,
      digest,
      options.signingIdentity,
    );
    metadata = { ...metadata, [SENDER_IDENTITY_EXTENSION]: envelope };
  }

  if (options?.userDelegation) {
    metadata = {
      ...metadata,
      [USER_DELEGATION_EXTENSION]: options.userDelegation,
    };
  }

  return {
    message: {
      kind: "message" as const,
      role: "user" as const,
      messageId,
      parts,
      contextId: options?.contextId ?? contextId,
      taskId: options?.taskId ?? taskId,
      ...(metadata && { metadata }),
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
