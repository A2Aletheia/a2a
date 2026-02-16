---
layout: default
title: Types
nav_order: 7
parent: API Reference
nav_category: api
---

# Types

All TypeScript types and interfaces exported by `@a2aletheia/a2a`. These types provide full type safety when using the SDK.

```typescript
import type {
  AletheiaA2AConfig,
  AgentSelector,
  MessageInput,
  SendOptions,
  TrustInfo,
  TrustedResponse,
  TrustedStreamEvent,
  TrustedTaskResponse,
  StoredContext,
  ContextStore,
} from "@a2aletheia/a2a";
```

---

## Configuration Types

### AletheiaA2AConfig

Configuration options for the `AletheiaA2A` client.

```typescript
interface AletheiaA2AConfig {
  registryUrl?: string;
  agentSelector?: AgentSelector;
  minTrustScore?: number;
  requireLive?: boolean;
  livenessCheckBeforeSend?: boolean;
  verifyIdentity?: boolean;
  authToken?: string;
  logger?: AletheiaLogger;
  logLevel?: AletheiaLogLevel;
  contextStore?: ContextStore;
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `registryUrl` | `string` | No | URL of the Aletheia registry for agent discovery. Defaults to the public Aletheia registry. |
| `agentSelector` | `AgentSelector` | No | Custom selector for choosing among multiple discovered agents. Defaults to `HighestTrustSelector`. |
| `minTrustScore` | `number` | No | Minimum trust score required for agent selection (0-100). Agents below this threshold are filtered out. |
| `requireLive` | `boolean` | No | If `true`, only agents with successful recent liveness checks are selected. Default: `false`. |
| `livenessCheckBeforeSend` | `boolean` | No | If `true`, performs a liveness check before each message send. Default: `false`. |
| `verifyIdentity` | `boolean` | No | If `true`, verifies agent DID signatures. Default: `true`. |
| `authToken` | `string` | No | Bearer token for registry authentication. Required for private registries. |
| `logger` | `AletheiaLogger` | No | Custom logger instance implementing the `AletheiaLogger` interface. |
| `logLevel` | `AletheiaLogLevel` | No | Log verbosity level: `'debug'` \| `'info'` \| `'warn'` \| `'error'`. |
| `contextStore` | `ContextStore` | No | Optional store for persisting conversation context across restarts. |

**Usage:**

```typescript
const client = new AletheiaA2A({
  registryUrl: "https://registry.aletheia.network",
  minTrustScore: 50,
  requireLive: true,
  logLevel: "debug",
});
```

---

### AgentSelector

Interface for custom agent selection strategies.

```typescript
interface AgentSelector {
  select(agents: Agent[]): Agent;
}
```

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `select` | `agents: Agent[]` | `Agent` | Selects one agent from the array of discovered agents. Must throw `AgentNotFoundError` if array is empty. |

**Usage:**

```typescript
class MySelector implements AgentSelector {
  select(agents: Agent[]): Agent {
    if (agents.length === 0) {
      throw new AgentNotFoundError("No agents available");
    }
    return agents[0];
  }
}
```

See [Agent Selectors](/api/agent-selectors) for built-in implementations.

---

## Message Types

### MessageInput

Input data for constructing A2A messages.

```typescript
interface MessageInput {
  text?: string;
  data?: Record<string, unknown>;
  parts?: Part[];
  contextId?: string;
  taskId?: string;
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `text` | `string` | No | Text content for the message. Converted to a `TextPart`. |
| `data` | `Record<string, unknown>` | No | Structured data payload. Converted to a `DataPart`. |
| `parts` | `Part[]` | No | Array of pre-constructed `Part` objects. Merged with text/data parts. |
| `contextId` | `string` | No | Conversation context ID for message threading. |
| `taskId` | `string` | No | Task ID for task-scoped messages. |

**Usage:**

```typescript
// Simple text message
await client.send("Hello, agent!");

// Structured input
await client.send({
  text: "Analyze this data",
  data: { metrics: [1, 2, 3] },
  contextId: "conversation-123",
});
```

---

### SendOptions

Options for message sending operations.

```typescript
interface SendOptions {
  acceptedOutputModes?: string[];
  blocking?: boolean;
  contextId?: string;
  taskId?: string;
  timeoutMs?: number;
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `acceptedOutputModes` | `string[]` | No | MIME types the client accepts in response. Default: `['text/plain', 'application/json']`. |
| `blocking` | `boolean` | No | If `true`, waits for task completion before returning. Default: `false`. |
| `contextId` | `string` | No | Overrides or sets the conversation context ID. |
| `taskId` | `string` | No | Overrides or sets the task ID. |
| `timeoutMs` | `number` | No | Timeout in milliseconds for the request. |

**Usage:**

```typescript
const response = await client.send("Process this", {
  blocking: true,
  timeoutMs: 30000,
  acceptedOutputModes: ["application/json"],
});
```

---

## Trust Types

### TrustInfo

Trust verification metadata for an agent interaction.

```typescript
interface TrustInfo {
  didVerified: boolean;
  isLive: boolean;
  trustScore: number | null;
  isBattleTested: boolean;
  responseVerified: boolean | null;
  verifiedAt: Date;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `didVerified` | `boolean` | Whether the agent's DID was cryptographically verified. |
| `isLive` | `boolean` | Whether the agent passed a recent liveness check. |
| `trustScore` | `number \| null` | Agent's trust score (0-100). `null` if unverified. |
| `isBattleTested` | `boolean` | Whether the agent has completed the battle-testing gauntlet. |
| `responseVerified` | `boolean \| null` | Whether the response signature was verified. `null` if not implemented (Phase 2+). |
| `verifiedAt` | `Date` | Timestamp when this trust info was computed. |

**Usage:**

```typescript
const response = await client.send("Hello");
if (response.trustInfo.trustScore && response.trustInfo.trustScore < 50) {
  console.warn("Low trust agent response");
}
```

---

### TrustedResponse

Response wrapper containing the A2A response and trust metadata.

```typescript
interface TrustedResponse {
  response: Task | Message;
  trustInfo: TrustInfo;
  agentDid: string | null;
  agentName: string;
  duration: number;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `response` | `Task \| Message` | The A2A protocol response object. |
| `trustInfo` | `TrustInfo` | Trust verification metadata for the interaction. |
| `agentDid` | `string \| null` | DID of the responding agent. `null` if unverified. |
| `agentName` | `string` | Human-readable name of the responding agent. |
| `duration` | `number` | Request duration in milliseconds. |

---

### TrustedStreamEvent

Event emitted during streaming operations.

```typescript
interface TrustedStreamEvent {
  event: A2AStreamEventData;
  kind: "message" | "task" | "status-update" | "artifact-update";
  agentDid: string | null;
  trustInfo: TrustInfo;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `event` | `A2AStreamEventData` | The underlying A2A protocol event data. |
| `kind` | `string` | Event type discriminator: `'message'` \| `'task'` \| `'status-update'` \| `'artifact-update'`. |
| `agentDid` | `string \| null` | DID of the streaming agent. `null` if unverified. |
| `trustInfo` | `TrustInfo` | Trust verification metadata. |

**Usage:**

```typescript
for await (const event of client.stream("Long task")) {
  switch (event.kind) {
    case "status-update":
      console.log("Status:", event.event.status?.state);
      break;
    case "artifact-update":
      console.log("Artifact received");
      break;
  }
}
```

---

### TrustedTaskResponse

Task-focused response wrapper for task-based operations.

```typescript
interface TrustedTaskResponse {
  response: Task;
  trustInfo: TrustInfo;
  agentDid: string | null;
  agentName: string;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `response` | `Task` | The A2A Task object. |
| `trustInfo` | `TrustInfo` | Trust verification metadata for the interaction. |
| `agentDid` | `string \| null` | DID of the responding agent. `null` if unverified. |
| `agentName` | `string` | Human-readable name of the responding agent. |

---

## Context Persistence Types

### StoredContext

Persisted conversation state for a single agent connection.

```typescript
interface StoredContext {
  contextId?: string;
  taskId?: string;
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `contextId` | `string` | No | Conversation context ID for threading messages. |
| `taskId` | `string` | No | Current task ID for task-scoped operations. |

---

### ContextStore

Pluggable interface for persisting conversation context across process restarts or serverless cold-starts.

```typescript
interface ContextStore {
  get(key: string): Promise<StoredContext | null>;
  set(key: string, data: StoredContext): Promise<void>;
  delete(key: string): Promise<void>;
}
```

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `get` | `key: string` | `Promise<StoredContext \| null>` | Retrieves stored context by key. Returns `null` if not found. |
| `set` | `key: string, data: StoredContext` | `Promise<void>` | Stores context data under the given key. |
| `delete` | `key: string` | `Promise<void>` | Removes stored context for the given key. |

**Usage with Redis:**

```typescript
import { createClient } from "redis";
import type { ContextStore, StoredContext } from "@a2aletheia/a2a";

class RedisContextStore implements ContextStore {
  constructor(private redis: ReturnType<typeof createClient>) {}

  async get(key: string): Promise<StoredContext | null> {
    const data = await this.redis.get(`context:${key}`);
    return data ? JSON.parse(data) : null;
  }

  async set(key: string, data: StoredContext): Promise<void> {
    await this.redis.set(`context:${key}`, JSON.stringify(data));
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(`context:${key}`);
  }
}

const client = new AletheiaA2A({
  contextStore: new RedisContextStore(redisClient),
});
```

---

### RedisLike

Re-exported from `@a2aletheia/sdk/agent`. Interface for Redis-compatible stores.

```typescript
type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
};
```

Provided for backward compatibility. Use `ContextStore` for new implementations.

---

## Re-exported A2A Protocol Types

All core A2A protocol types are re-exported from `@a2a-js/sdk` for convenience. You don't need to install or import from `@a2a-js/sdk` directly.

### AgentCard

Agent metadata and capabilities descriptor.

```typescript
import type { AgentCard } from "@a2aletheia/a2a";
```

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Human-readable agent name. |
| `description` | `string` | Agent description and purpose. |
| `url` | `string` | Base URL for the agent's A2A endpoint. |
| `version` | `string` | Agent version string. |
| `capabilities` | `AgentCapabilities` | Supported features like streaming, push notifications. |
| `defaultInputModes` | `string[]` | Accepted input MIME types. |
| `defaultOutputModes` | `string[]` | Output MIME types the agent produces. |
| `skills` | `AgentSkill[]` | Array of skills/capabilities the agent provides. |

---

### Message

A2A message object containing parts with content.

```typescript
import type { Message } from "@a2aletheia/a2a";
```

| Property | Type | Description |
|----------|------|-------------|
| `kind` | `"message"` | Type discriminator. |
| `messageId` | `string` | Unique message identifier. |
| `role` | `"user"` \| `"agent"` | Message sender role. |
| `parts` | `Part[]` | Array of content parts. |
| `contextId` | `string` | Optional conversation context ID. |
| `taskId` | `string` | Optional task ID reference. |

---

### Task

A2A task object representing a unit of work.

```typescript
import type { Task } from "@a2aletheia/a2a";
```

| Property | Type | Description |
|----------|------|-------------|
| `kind` | `"task"` | Type discriminator. |
| `id` | `string` | Unique task identifier. |
| `contextId` | `string` | Conversation context ID. |
| `status` | `TaskStatus` | Current task status and state. |
| `history` | `Message[]` | Message history for the task. |
| `artifacts` | `Artifact[]` | Generated artifacts. |

---

### TaskState

Enumeration of possible task states.

```typescript
import type { TaskState } from "@a2aletheia/a2a";
```

| Value | Description |
|-------|-------------|
| `"submitted"` | Task has been submitted. |
| `"working"` | Task is actively being processed. |
| `"input-required"` | Task requires additional input. |
| `"completed"` | Task completed successfully. |
| `"canceled"` | Task was canceled. |
| `"failed"` | Task failed with an error. |

---

### TaskStatus

Task status information including state and timestamps.

```typescript
import type { TaskStatus } from "@a2aletheia/a2a";
```

| Property | Type | Description |
|----------|------|-------------|
| `state` | `TaskState` | Current state of the task. |
| `timestamp` | `string` | ISO timestamp of status. |
| `message` | `Message` | Optional status message. |

---

### Part

Union type for message content parts.

```typescript
import type { Part } from "@a2aletheia/a2a";

type Part = TextPart | FilePart | DataPart;
```

---

### TextPart

Text content in a message.

```typescript
import type { TextPart } from "@a2aletheia/a2a";
```

| Property | Type | Description |
|----------|------|-------------|
| `kind` | `"text"` | Type discriminator. |
| `text` | `string` | Text content. |

---

### FilePart

File content with optional metadata.

```typescript
import type { FilePart } from "@a2aletheia/a2a";
```

| Property | Type | Description |
|----------|------|-------------|
| `kind` | `"file"` | Type discriminator. |
| `file` | `FileContent` | File data with bytes or URI. |
| `mimeType` | `string` | Optional MIME type. |

---

### DataPart

Structured data content in a message.

```typescript
import type { DataPart } from "@a2aletheia/a2a";
```

| Property | Type | Description |
|----------|------|-------------|
| `kind` | `"data"` | Type discriminator. |
| `data` | `Record<string, unknown>` | Structured data payload. |

---

### Artifact

Generated artifact from task execution.

```typescript
import type { Artifact } from "@a2aletheia/a2a";
```

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Artifact name. |
| `description` | `string` | Optional description. |
| `parts` | `Part[]` | Content parts. |
| `index` | `number` | Position in artifact sequence. |

---

### TaskStatusUpdateEvent

Streaming event for task status changes.

```typescript
import type { TaskStatusUpdateEvent } from "@a2aletheia/a2a";
```

| Property | Type | Description |
|----------|------|-------------|
| `kind` | `"status-update"` | Type discriminator. |
| `taskId` | `string` | Task ID. |
| `status` | `TaskStatus` | New status. |
| `final` | `boolean` | Whether this is the final update. |

---

### TaskArtifactUpdateEvent

Streaming event for artifact generation.

```typescript
import type { TaskArtifactUpdateEvent } from "@a2aletheia/a2a";
```

| Property | Type | Description |
|----------|------|-------------|
| `kind` | `"artifact-update"` | Type discriminator. |
| `taskId` | `string` | Task ID. |
| `artifact` | `Artifact` | Generated artifact. |

---

### MessageSendParams

Parameters for sending a message to an agent.

```typescript
import type { MessageSendParams } from "@a2aletheia/a2a";
```

| Property | Type | Description |
|----------|------|-------------|
| `message` | `Message` | The message to send. |
| `configuration` | `MessageSendConfiguration` | Optional send configuration. |

---

### MessageSendConfiguration

Configuration options for message sending.

```typescript
import type { MessageSendConfiguration } from "@a2aletheia/a2a";
```

| Property | Type | Description |
|----------|------|-------------|
| `acceptedOutputModes` | `string[]` | Accepted response MIME types. |
| `blocking` | `boolean` | Wait for task completion. |
| `historyLength` | `number` | Number of history messages to include. |

---

### A2AClient

Low-level A2A protocol client for direct agent communication.

```typescript
import { A2AClient } from "@a2aletheia/a2a";
```

Re-exported from `@a2a-js/sdk/client`. Use `AletheiaA2A` for trust-verified communication.

---

### A2AStreamEventData

Union type for all streaming event data types.

```typescript
import type { A2AStreamEventData } from "@a2aletheia/a2a";

type A2AStreamEventData = Message | Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent;
```

Defined locally as it's not exported from `@a2a-js/sdk`.
