// Main entry point
export { AletheiaA2A } from "./aletheia-a2a.js";

// Peer agent (full-duplex: server + client)
export { PeerAgent } from "./peer-agent.js";
export type { PeerAgentConfig } from "./peer-agent.js";

// Connection handle
export { TrustedAgent } from "./trusted-agent.js";

// Agent selectors
export {
  HighestTrustSelector,
  RandomSelector,
  FirstMatchSelector,
} from "./agent-selector.js";

// Context persistence
export { redisContextStore } from "./context-store.js";
export type { RedisContextStoreOptions } from "./context-store.js";

// Task persistence (re-exported from SDK for convenience)
export { RedisTaskStore } from "@a2aletheia/sdk/agent";
export type { RedisTaskStoreOptions } from "@a2aletheia/sdk/agent";

// Errors
export {
  AletheiaA2AError,
  AgentNotFoundError,
  DIDResolutionError,
  AgentNotLiveError,
  TrustScoreBelowThresholdError,
  A2AProtocolError,
} from "./errors.js";

// Sender identity (Layer 1 — Agent-to-Agent)
export {
  getVerifiedSender,
  computePartsDigest,
  createSenderEnvelope,
  extractSenderEnvelope,
  verifySenderEnvelope,
} from "./sender-identity.js";

// User delegation (Layer 2 — User-to-Agent)
export {
  getVerifiedUser,
  signUserDelegation,
  verifyUserDelegation,
  extractUserDelegation,
  DELEGATION_DOMAIN,
  DELEGATION_TYPES,
} from "./user-delegation.js";

// Package types
export {
  SENDER_IDENTITY_EXTENSION,
  USER_DELEGATION_EXTENSION,
} from "./types.js";

export type {
  AletheiaA2AConfig,
  AgentSelector,
  AgentSigningIdentity,
  MessageInput,
  SendOptions,
  TrustInfo,
  TrustedResponse,
  TrustedStreamEvent,
  TrustedTaskResponse,
  ContextStore,
  StoredContext,
  RedisLike,
  SenderIdentityEnvelope,
  VerifiedSender,
  UserDelegation,
  UserDelegationEnvelope,
  VerifiedUser,
} from "./types.js";

// Re-exported A2A protocol types (consumers never need @a2a-js/sdk)
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
  A2AClient,
  A2AStreamEventData,
} from "./types.js";
