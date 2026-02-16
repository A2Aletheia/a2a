---
layout: default
title: TrustedAgent
nav_order: 2
parent: API Reference
nav_category: api
---

# TrustedAgent

`TrustedAgent` is a connection handle representing a trusted communication channel to a remote A2A agent. It wraps the A2A protocol client with trust verification, conversation context tracking, and persistent state management.

```typescript
import { TrustedAgent } from "@a2aletheia/a2a";
```

## Obtaining a TrustedAgent

You do not construct `TrustedAgent` instances directly. Instead, obtain one through `AletheiaA2A.connect()`:

```typescript
import { AletheiaA2A } from "@a2aletheia/a2a";

const client = new AletheiaA2A({ registryUrl: "https://registry.example.com" });
const agent = await client.connect("did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK");

// agent is a TrustedAgent instance
const response = await agent.send("Hello!");
```

---

## Properties

### `did`

```typescript
readonly did: string | null
```

The DID (Decentralized Identifier) of the connected agent. `null` if the agent was resolved from an endpoint URL rather than a DID.

---

### `agent`

```typescript
agent: Agent | null
```

The full agent record from the Aletheia registry. Contains metadata like `name`, `trustScore`, `isLive`, `isBattleTested`. `null` if the agent was resolved from an endpoint URL without registry lookup.

---

### `agentCard`

```typescript
readonly agentCard: AgentCard
```

The A2A Agent Card describing the agent's capabilities, skills, and supported interaction modes. This is fetched from the agent's `/.well-known/agent.json` endpoint.

**See:** [A2A Agent Card Specification](https://github.com/a2a-js/sdk#agent-card)

---

### `trustInfo`

```typescript
trustInfo: TrustInfo
```

Trust verification data for the connected agent.

| Property | Type | Description |
|----------|------|-------------|
| `didVerified` | `boolean` | Whether the agent's DID was cryptographically verified |
| `isLive` | `boolean` | Whether the agent responded to a recent liveness check |
| `trustScore` | `number \| null` | Agent's trust score from the registry (null if unavailable) |
| `isBattleTested` | `boolean` | Whether the agent has passed battle testing in production |
| `responseVerified` | `boolean \| null` | Whether the response signature was verified (Phase 2+) |
| `verifiedAt` | `Date` | Timestamp of when trust data was last verified |

---

### `supportsStreaming`

```typescript
get supportsStreaming(): boolean
```

Returns `true` if the agent supports streaming responses via SSE. Determined by checking `agentCard.capabilities.streaming`.

```typescript
if (agent.supportsStreaming) {
  for await (const event of agent.stream("Hello!")) {
    console.log(event.kind, event.event);
  }
} else {
  const response = await agent.send("Hello!");
}
```

---

### `contextId`

```typescript
get contextId(): string | undefined
```

The conversation context ID from the most recent exchange. Used to maintain conversation continuity across multiple messages. Populated after the first `send()` or `stream()` call.

---

### `lastTaskId`

```typescript
get lastTaskId(): string | undefined
```

The task ID from the most recent exchange. Can be used to query task status or resubscribe to a streaming task.

---

## Methods

### `restoreContext()`

```typescript
async restoreContext(): Promise<void>
```

Restores conversation context (`contextId` and `lastTaskId`) from the persistent store. Called automatically by `AletheiaA2A` after constructing a new `TrustedAgent` instance.

**Parameters:** None

**Returns:** `Promise<void>`

**Important:** This method is called automatically and rarely needs manual invocation. It's used internally to survive process restarts or serverless cold-starts when a `ContextStore` is configured.

```typescript
// Automatic flow - AletheiaA2A calls this for you
const agent = await client.connect(did);
// Context already restored if persisted previously

// Manual restoration (rarely needed)
await agent.restoreContext();
```

---

### `send(input, options?)`

```typescript
async send(
  input: string | MessageInput,
  options?: SendOptions
): Promise<TrustedResponse>
```

Sends a message to the agent and waits for a response. Automatically carries forward conversation context (`contextId` and `lastTaskId`) for multi-turn conversations.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | `string \| MessageInput` | Yes | The message content. Strings are converted to text parts. Use `MessageInput` for structured data. |
| `options` | `SendOptions` | No | Additional send configuration |

**SendOptions Interface:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `acceptedOutputModes` | `string[]` | `["text/plain", "application/json"]` | MIME types the client accepts |
| `blocking` | `boolean` | `true` | Whether to wait for task completion |
| `contextId` | `string` | Tracked context | Explicit context ID (overrides tracked value) |
| `taskId` | `string` | Tracked task | Explicit task ID (overrides tracked value) |
| `timeoutMs` | `number` | - | Request timeout in milliseconds |

**MessageInput Interface:**

| Property | Type | Description |
|----------|------|-------------|
| `text` | `string` | Text content |
| `data` | `Record<string, unknown>` | Structured data payload |
| `parts` | `Part[]` | Raw A2A message parts |
| `contextId` | `string` | Context ID to use |
| `taskId` | `string` | Task ID to continue |

**Returns:** `Promise<TrustedResponse>`

**TrustedResponse Interface:**

| Property | Type | Description |
|----------|------|-------------|
| `response` | `Task \| Message` | The A2A response object |
| `trustInfo` | `TrustInfo` | Current trust verification data |
| `agentDid` | `string \| null` | Agent's DID |
| `agentName` | `string` | Agent's display name |
| `duration` | `number` | Request duration in milliseconds |

**Example:**

```typescript
// Simple text message
const response = await agent.send("What is the weather today?");
console.log(response.agentName, "replied in", response.duration, "ms");

// Structured message with data
const response = await agent.send({
  text: "Analyze this data",
  data: { temperature: 72, humidity: 45 }
});

// First message starts a conversation
const r1 = await agent.send("My name is Alice");
console.log("Context:", agent.contextId); // Defined now

// Subsequent messages continue the conversation
const r2 = await agent.send("What's my name?"); // Context carried forward
```

**Context Tracking:** After each `send()`, `contextId` and `lastTaskId` are updated from the response, enabling automatic conversation continuity.

---

### `stream(input, options?)`

```typescript
async *stream(
  input: string | MessageInput,
  options?: SendOptions
): AsyncGenerator<TrustedStreamEvent>
```

Sends a message and receives streaming events via Server-Sent Events (SSE). Use this for real-time responses from agents that support streaming.

**Parameters:** Same as [`send()`](#sendinput-options)

**Returns:** `AsyncGenerator<TrustedStreamEvent>`

**TrustedStreamEvent Interface:**

| Property | Type | Description |
|----------|------|-------------|
| `event` | `A2AStreamEventData` | The raw A2A event (Message, Task, StatusUpdate, or ArtifactUpdate) |
| `kind` | `"message" \| "task" \| "status-update" \| "artifact-update"` | Event type discriminator |
| `agentDid` | `string \| null` | Agent's DID |
| `trustInfo` | `TrustInfo` | Current trust verification data |

**Example:**

```typescript
if (!agent.supportsStreaming) {
  throw new Error("Agent does not support streaming");
}

for await (const event of agent.stream("Write a poem about AI")) {
  switch (event.kind) {
    case "status-update":
      console.log("Status:", event.event.status?.state);
      break;
    case "artifact-update":
      console.log("Artifact:", event.event.artifact);
      break;
    case "task":
      console.log("Task completed:", event.event.id);
      break;
    case "message":
      console.log("Message:", event.event);
      break;
  }
}

// Context tracked after streaming completes
console.log("Context ID:", agent.contextId);
```

**Context Tracking:** Context is tracked from streaming events. The `contextId` and `lastTaskId` are populated from the first `task` event received.

---

### `getTask(taskId)`

```typescript
async getTask(taskId: string): Promise<TrustedTaskResponse>
```

Retrieves the current state of a task by its ID. Use this to check task status after a non-blocking `send()` or to poll long-running tasks.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | `string` | Yes | The task ID to query |

**Returns:** `Promise<TrustedTaskResponse>`

**TrustedTaskResponse Interface:**

| Property | Type | Description |
|----------|------|-------------|
| `response` | `Task` | The task object with current state |
| `trustInfo` | `TrustInfo` | Current trust verification data |
| `agentDid` | `string \| null` | Agent's DID |
| `agentName` | `string` | Agent's display name |

**Example:**

```typescript
// Non-blocking send returns immediately
const response = await agent.send("Generate a report", { blocking: false });
const taskId = response.response.id; // Task ID

// Poll for completion
let task = await agent.getTask(taskId);
while (task.response.status?.state !== "completed") {
  await new Promise(r => setTimeout(r, 1000));
  task = await agent.getTask(taskId);
}

console.log("Task completed:", task.response.artifacts);
```

---

### `cancelTask(taskId)`

```typescript
async cancelTask(taskId: string): Promise<TrustedTaskResponse>
```

Cancels a running task by its ID. The agent will attempt to stop processing and mark the task as canceled.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | `string` | Yes | The task ID to cancel |

**Returns:** `Promise<TrustedTaskResponse>`

**Example:**

```typescript
// Start a long-running task
const response = await agent.send("Process this large file", { blocking: false });
const taskId = response.response.id;

// Cancel if taking too long
setTimeout(async () => {
  const canceled = await agent.cancelTask(taskId);
  console.log("Task canceled:", canceled.response.status?.state);
}, 30000);
```

---

### `resubscribeTask(taskId)`

```typescript
async *resubscribeTask(taskId: string): AsyncGenerator<TrustedStreamEvent>
```

Resubscribes to an existing task's event stream. Use this to reconnect to streaming events after a connection interruption.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | `string` | Yes | The task ID to resubscribe to |

**Returns:** `AsyncGenerator<TrustedStreamEvent>` - Same event types as [`stream()`](#streaminput-options)

**Example:**

```typescript
// Original streaming connection lost
const taskId = agent.lastTaskId;

// Reconnect to the task stream
for await (const event of agent.resubscribeTask(taskId!)) {
  console.log(event.kind, event.event);
}
```

---

### `refreshCard()`

```typescript
async refreshCard(): Promise<AgentCard>
```

Fetches a fresh Agent Card from the agent's endpoint and updates the `agentCard` property. Use this to get updated capabilities or metadata.

**Parameters:** None

**Returns:** `Promise<AgentCard>`

**Example:**

```typescript
// Check if agent now supports streaming
const card = await agent.refreshCard();
if (card.capabilities?.streaming) {
  console.log("Agent now supports streaming!");
}
```

---

### `refreshTrust()`

```typescript
async refreshTrust(): Promise<TrustInfo>
```

Re-fetches the agent record from the Aletheia registry and updates `trustInfo` and `agent` properties. Call this to get fresh `isLive`, `trustScore`, and `isBattleTested` values.

**Parameters:** None

**Returns:** `Promise<TrustInfo>`

**Important:** Only works when the agent was resolved via DID from a registry. Returns current `trustInfo` if agent has no DID or no registry client is configured.

**Example:**

```typescript
// Check if agent is still live before critical operation
const trust = await agent.refreshTrust();
if (!trust.isLive) {
  throw new Error("Agent is not responding to liveness checks");
}

if (trust.trustScore !== null && trust.trustScore < 0.8) {
  console.warn("Agent trust score dropped:", trust.trustScore);
}
```

---

### `resetContext()`

```typescript
resetContext(): void
```

Clears conversation context (`contextId` and `lastTaskId`). The next `send()` or `stream()` call will start a fresh conversation.

**Parameters:** None

**Returns:** `void`

**When to Use:**

- Starting a new conversation with the same agent
- Clearing context after completing a multi-turn interaction
- Resetting after an error that corrupted conversation state

**Example:**

```typescript
// Multi-turn conversation
await agent.send("Book a flight to Paris");
await agent.send("Add a hotel reservation");

// Start fresh conversation
agent.resetContext();
await agent.send("What's the weather in Tokyo?"); // New context
```

**Persistence:** If a `ContextStore` is configured, this method also deletes the persisted context from the store.

---

## Context Tracking

`TrustedAgent` automatically tracks conversation context across message exchanges:

### How It Works

1. **First Message:** `contextId` and `lastTaskId` are `undefined`
2. **After Response:** Both are populated from the A2A response
3. **Subsequent Messages:** Values are automatically included in requests
4. **Persistence:** With a `ContextStore`, context survives process restarts

### Overriding Context

Explicitly pass `contextId` or `taskId` in options to override tracked values:

```typescript
// Override to join existing conversation
await agent.send("Hello!", { contextId: "existing-context-123" });

// Override to continue specific task
await agent.send("Continue", { taskId: "task-456" });
```

### Context Lifecycle

```typescript
// New conversation
await agent.send("Hello");        // contextId: undefined -> "ctx-1"

// Continue conversation
await agent.send("How are you?"); // Uses contextId: "ctx-1"

// Reset for new conversation
agent.resetContext();             // contextId: undefined

// Start fresh
await agent.send("New topic");    // contextId: undefined -> "ctx-2"
```