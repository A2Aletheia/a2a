---
layout: default
title: AletheiaA2A
nav_order: 1
parent: API Reference
nav_category: api
---

# AletheiaA2A

The main entry point for interacting with the Aletheia A2A network. `AletheiaA2A` provides methods for agent discovery, connection management, and trusted message exchange.

## Import

```typescript
import { AletheiaA2A } from "@a2aletheia/a2a";
```

## Constructor

Creates a new `AletheiaA2A` instance with the specified configuration.

```typescript
constructor(config?: AletheiaA2AConfig)
```

### AletheiaA2AConfig

| Name | Type | Description | Required |
|------|------|-------------|----------|
| `registryUrl` | `string` | URL of the Aletheia agent registry. Defaults to the public registry. | No |
| `agentSelector` | `AgentSelector` | Custom agent selection strategy. Defaults to `HighestTrustSelector`. | No |
| `minTrustScore` | `number` | Minimum trust score required for agent selection. | No |
| `requireLive` | `boolean` | Require agents to have recent liveness proofs. | No |
| `livenessCheckBeforeSend` | `boolean` | Perform liveness verification before sending messages. | No |
| `verifyIdentity` | `boolean` | Verify agent DID identity before connection. | No |
| `authToken` | `string` | Authentication token for the Aletheia registry. | No |
| `logger` | `AletheiaLogger` | Custom logger instance. Defaults to `ConsoleLogger`. | No |
| `logLevel` | `AletheiaLogLevel` | Logging verbosity: `"debug"` \| `"info"` \| `"warn"` \| `"error"`. | No |
| `contextStore` | `ContextStore` | Store for persisting conversation context across restarts. | No |

### Example

```typescript
const client = new AletheiaA2A({
  registryUrl: "https://api.aletheia.ai",
  minTrustScore: 50,
  requireLive: true,
  logLevel: "debug",
  contextStore: new RedisContextStore(redisClient),
});
```

---

## Properties

### logger

```typescript
readonly logger: AletheiaLogger
```

The logger instance used by this client. Useful for debugging and monitoring.

---

## Methods

### discover()

Discover agents from the Aletheia registry based on search criteria.

```typescript
async discover(params: {
  capability?: string;
  query?: string;
  isLive?: boolean;
  minTrustScore?: number;
  limit?: number;
}): Promise<Agent[]>
```

#### Parameters

| Name | Type | Description | Required |
|------|------|-------------|----------|
| `capability` | `string` | Filter agents by capability (e.g., `"text-generation"`). | No |
| `query` | `string` | Natural language search query. | No |
| `isLive` | `boolean` | Filter to only live agents. Defaults to config `requireLive`. | No |
| `minTrustScore` | `number` | Minimum trust score filter. Defaults to config `minTrustScore`. | No |
| `limit` | `number` | Maximum number of results to return. | No |

#### Returns

`Promise<Agent[]>` - Array of matching agents.

#### Example

```typescript
const agents = await client.discover({
  capability: "text-generation",
  minTrustScore: 75,
  limit: 10,
});

for (const agent of agents) {
  console.log(`${agent.name} (trust: ${agent.trustScore})`);
}
```

---

### connect()

Establish a trusted connection to an agent by its DID. Connections are cached and reused to preserve conversation context.

```typescript
async connect(did: string): Promise<TrustedAgent>
```

#### Parameters

| Name | Type | Description | Required |
|------|------|-------------|----------|
| `did` | `string` | The decentralized identifier (DID) of the agent. | Yes |

#### Returns

`Promise<TrustedAgent>` - A connected trusted agent instance.

#### Caching Behavior

Connections are cached by DID. Reconnecting to the same DID returns the cached `TrustedAgent` with refreshed trust information, preserving the conversation's `contextId` and `taskId`.

#### Example

```typescript
const agent = await client.connect("did:aletheia:agent-abc123");
const response = await agent.send("Hello, agent!");
```

---

### connectByUrl()

Connect directly to an agent by its A2A endpoint URL, bypassing the registry.

```typescript
async connectByUrl(
  url: string,
  options?: { scope?: string }
): Promise<TrustedAgent>
```

#### Parameters

| Name | Type | Description | Required |
|------|------|-------------|----------|
| `url` | `string` | The A2A endpoint URL of the agent. | Yes |
| `options.scope` | `string` | Scope identifier for context isolation. Use different scopes per user/session. | No |

#### Returns

`Promise<TrustedAgent>` - A connected trusted agent instance.

#### Scoping

The `scope` option isolates connection contexts. Without scope, all callers share one conversation context, which is incorrect for multi-user applications.

#### Example

```typescript
// Single-user context
const agent = await client.connectByUrl("https://agent.example.com/a2a");

// Multi-user context (separate conversation per user)
const userAgent = await client.connectByUrl(
  "https://agent.example.com/a2a",
  { scope: `user:${userId}` }
);
```

---

### sendByCapability()

Discover agents with a capability, select the best one, and send a message in one operation.

```typescript
async sendByCapability(
  capability: string,
  input: string | MessageInput,
  options?: SendOptions
): Promise<TrustedResponse>
```

#### Parameters

| Name | Type | Description | Required |
|------|------|-------------|----------|
| `capability` | `string` | The capability to search for (e.g., `"translation"`). | Yes |
| `input` | `string \| MessageInput` | Message content as string or structured input. | Yes |
| `options` | `SendOptions` | Send configuration options. | No |

#### SendOptions

| Name | Type | Description | Required |
|------|------|-------------|----------|
| `acceptedOutputModes` | `string[]` | Accepted response MIME types. | No |
| `blocking` | `boolean` | Wait for task completion. | No |
| `contextId` | `string` | Existing conversation context ID. | No |
| `taskId` | `string` | Existing task ID to continue. | No |
| `timeoutMs` | `number` | Request timeout in milliseconds. | No |

#### Returns

`Promise<TrustedResponse>` - Response with trust metadata:

| Property | Type | Description |
|----------|------|-------------|
| `response` | `Task \| Message` | The agent's response. |
| `trustInfo` | `TrustInfo` | Trust verification details. |
| `agentDid` | `string \| null` | The responding agent's DID. |
| `agentName` | `string` | The responding agent's name. |
| `duration` | `number` | Request duration in milliseconds. |

#### Example

```typescript
const response = await client.sendByCapability(
  "translation",
  "Translate 'hello' to French",
  { timeoutMs: 30000 }
);

console.log(`Response from ${response.agentName}:`, response.response);
console.log(`Trust score: ${response.trustInfo.trustScore}`);
```

---

### streamByCapability()

Discover agents with a capability and stream the response as an async generator.

```typescript
async *streamByCapability(
  capability: string,
  input: string | MessageInput,
  options?: SendOptions
): AsyncGenerator<TrustedStreamEvent>
```

#### Parameters

| Name | Type | Description | Required |
|------|------|-------------|----------|
| `capability` | `string` | The capability to search for. | Yes |
| `input` | `string \| MessageInput` | Message content as string or structured input. | Yes |
| `options` | `SendOptions` | Send configuration options. | No |

#### Returns

`AsyncGenerator<TrustedStreamEvent>` - Yields stream events:

| Property | Type | Description |
|----------|------|-------------|
| `event` | `A2AStreamEventData` | The raw stream event data. |
| `kind` | `string` | Event type: `"message"` \| `"task"` \| `"status-update"` \| `"artifact-update"`. |
| `agentDid` | `string \| null` | The agent's DID. |
| `trustInfo` | `TrustInfo` | Trust verification details. |

#### Example

```typescript
const stream = client.streamByCapability(
  "text-generation",
  "Write a short story about a robot"
);

for await (const event of stream) {
  if (event.kind === "status-update") {
    console.log("Status:", event.event.status?.state);
  } else if (event.kind === "artifact-update") {
    process.stdout.write(event.event.artifact.parts[0].text);
  }
}
```

---

### clearConnections()

Clear all cached connections. Use this to force fresh connections on subsequent calls.

```typescript
clearConnections(): void
```

#### When to Use

- After authentication state changes
- To reset conversation contexts
- Before running isolated tests
- When switching user sessions

#### Example

```typescript
// Clear all cached connections
client.clearConnections();

// Next connect/send will create fresh connections
```

---

### disconnectAgent()

Remove a specific agent from the connection cache.

```typescript
disconnectAgent(did: string): void
```

#### Parameters

| Name | Type | Description | Required |
|------|------|-------------|----------|
| `did` | `string` | The DID of the agent to disconnect. | Yes |

#### When to Use

- Ending a conversation with a specific agent
- Forcing reconnection to an agent with fresh state
- Managing connection lifecycle per-agent

#### Example

```typescript
// Disconnect a specific agent
client.disconnectAgent("did:aletheia:agent-abc123");

// Next connect() call will create a fresh connection
```

---

## Internal Details

### Connection Caching

`AletheiaA2A` maintains two internal caches:

1. **DID Cache** (`_connectionCache`) - Maps agent DIDs to `TrustedAgent` instances
2. **URL Cache** (`_urlConnectionCache`) - Maps URLs (with optional scope) to `TrustedAgent` instances

When reconnecting to a cached agent:
- The `TrustedAgent` instance is reused
- Fresh trust data is fetched and updated
- Conversation context (`contextId`/`taskId`) is preserved

This caching behavior enables:
- Efficient connection reuse
- Conversation continuity across calls
- Persistent context when using `contextStore`
