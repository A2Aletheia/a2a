---
layout: default
title: PeerAgent
nav_order: 3
parent: API Reference
nav_category: api
---

# PeerAgent

A full-duplex peer that can both host an A2A agent (inbound) and send trust-verified requests to other agents (outbound). `PeerAgent` composes `AletheiaAgent` (server) + `AletheiaA2A` (client) into a single unified interface.

## Import

```typescript
import { PeerAgent } from "@a2aletheia/a2a";
```

## Constructor

### `new PeerAgent(config: PeerAgentConfig)`

Creates a new PeerAgent instance with the specified configuration.

#### PeerAgentConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| **Shared** |
| `registryUrl` | `string` | No | URL of the Aletheia registry for discovery |
| **Server-side (Inbound)** |
| `name` | `string` | Yes | Agent name displayed in registry |
| `version` | `string` | Yes | Agent version (semver) |
| `url` | `string` | Yes | Base URL where agent is hosted |
| `description` | `string` | Yes | Agent description for registry |
| `skills` | `AgentSkill[]` | Yes | List of capabilities this agent provides |
| `defaultInputModes` | `string[]` | No | Default input content types |
| `defaultOutputModes` | `string[]` | No | Default output content types |
| `capabilities` | `Partial<AgentCapabilities>` | No | Agent capabilities (streaming, push notifications, etc.) |
| `iconUrl` | `string` | No | URL to agent icon |
| `documentationUrl` | `string` | No | URL to agent documentation |
| `provider` | `{ organization: string; url: string }` | No | Provider information |
| `aletheiaExtensions` | `AletheiaExtensions` | No | Aletheia-specific extensions |
| `taskStore` | `TaskStore` | No | Custom task storage backend |
| **Client-side (Outbound)** |
| `agentSelector` | `AgentSelector` | No | Custom agent selection strategy |
| `minTrustScore` | `number` | No | Minimum trust score for agent selection |
| `requireLive` | `boolean` | No | Require agents to be live |
| `livenessCheckBeforeSend` | `boolean` | No | Check liveness before sending |
| `verifyIdentity` | `boolean` | No | Verify agent identity via DID |
| `authToken` | `string` | No | Authentication token for outbound requests |
| **Observability** |
| `logger` | `AletheiaLogger` | No | Custom logger implementation (BYOL) |
| `logLevel` | `AletheiaLogLevel` | No | Log level threshold |

#### Example

```typescript
const peer = new PeerAgent({
  registryUrl: "https://registry.aletheia.dev",
  name: "Orchestrator",
  version: "1.0.0",
  url: "https://orchestrator.example.com",
  description: "Routes work to specialist agents",
  skills: [
    { id: "orchestrate", name: "orchestrate", description: "Orchestrate tasks", tags: [] }
  ],
  minTrustScore: 0.7,
  requireLive: true,
});
```

---

## Inbound Methods (Server-side)

These methods configure how your agent handles incoming requests from other agents.

### handle()

Register the message handler for incoming requests.

#### Signature

```typescript
handle(handler: AgentHandler): this
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `handler` | `AgentHandler` | Async function receiving `(context, response)` for processing requests |

#### Return Type

`this` - Returns the PeerAgent instance for method chaining.

#### Example

```typescript
peer.handle(async (context, response) => {
  const result = await processRequest(context.textContent);
  response.text(result);
});
```

---

### onCancel()

Register an optional cancel handler for when clients request task cancellation.

#### Signature

```typescript
onCancel(handler: CancelHandler): this
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `handler` | `CancelHandler` | Async function called when a task is cancelled |

#### Return Type

`this` - Returns the PeerAgent instance for method chaining.

#### Example

```typescript
peer.onCancel(async (taskId, reason) => {
  console.log(`Task ${taskId} cancelled: ${reason}`);
  await cleanupResources(taskId);
});
```

---

### handleRequest()

Handle a JSON-RPC request body directly. This is a framework-agnostic method for integrating with custom HTTP frameworks.

#### Signature

```typescript
async handleRequest(
  body: unknown
): Promise<A2AResponse | AsyncGenerator<A2AResponse, void, undefined>>
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `body` | `unknown` | JSON-RPC request body |

#### Return Type

`Promise<A2AResponse | AsyncGenerator<A2AResponse, void, undefined>>` - Response or async generator for streaming.

#### Example

```typescript
// Custom Fastify integration
app.post('/a2a', async (request, reply) => {
  const result = await peer.handleRequest(request.body);
  
  if (isAsyncGenerator(result)) {
    reply.type('application/jsonl');
    for await (const chunk of result) {
      reply.raw.write(JSON.stringify(chunk) + '\n');
    }
    reply.raw.end();
  } else {
    return result;
  }
});
```

---

## Outbound Methods (Client-side)

These methods enable your agent to discover and communicate with other trusted agents.

### discover()

Discover agents by capability, query, or trust criteria. Delegates to the underlying `AletheiaA2A` client.

#### Signature

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

| Name | Type | Description |
|------|------|-------------|
| `params.capability` | `string` | Filter by capability/skill |
| `params.query` | `string` | Free-text search query |
| `params.isLive` | `boolean` | Filter for live agents only |
| `params.minTrustScore` | `number` | Minimum trust score threshold |
| `params.limit` | `number` | Maximum number of results |

#### Return Type

`Promise<Agent[]>` - Array of matching agents from the registry.

#### Example

```typescript
const agents = await peer.discover({
  capability: "translation",
  minTrustScore: 0.8,
  isLive: true,
  limit: 5
});

for (const agent of agents) {
  console.log(`${agent.name} (trust: ${agent.trustScore})`);
}
```

---

### connect()

Connect to an agent by DID with trust verification.

#### Signature

```typescript
async connect(did: string): Promise<TrustedAgent>
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `did` | `string` | Decentralized identifier of the target agent |

#### Return Type

`Promise<TrustedAgent>` - A trusted agent instance for secure communication.

#### Example

```typescript
const translator = await peer.connect("did:aletheia:translator.example.com");
const response = await translator.send("Hello, world!");
```

---

### connectByUrl()

Connect to an agent by URL without trust verification. Use for testing or trusted internal networks.

#### Signature

```typescript
async connectByUrl(url: string): Promise<TrustedAgent>
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `url` | `string` | Base URL of the target agent |

#### Return Type

`Promise<TrustedAgent>` - A trusted agent instance.

#### Example

```typescript
const localAgent = await peer.connectByUrl("http://localhost:3000");
const response = await localAgent.send("Test message");
```

---

### sendByCapability()

Discover, select, and send a message to an agent by capability in one operation.

#### Signature

```typescript
async sendByCapability(
  capability: string,
  input: string | MessageInput,
  options?: SendOptions
): Promise<TrustedResponse>
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `capability` | `string` | Capability/skill to discover agents by |
| `input` | `string \| MessageInput` | Message content (string or structured input) |
| `options` | `SendOptions` | Optional send configuration |

#### SendOptions

| Property | Type | Description |
|----------|------|-------------|
| `acceptedOutputModes` | `string[]` | Accepted response content types |
| `blocking` | `boolean` | Wait for complete response |
| `contextId` | `string` | Conversation context ID |
| `taskId` | `string` | Existing task ID to continue |
| `timeoutMs` | `number` | Request timeout in milliseconds |

#### Return Type

`Promise<TrustedResponse>` - Response with trust verification metadata.

#### TrustedResponse

| Property | Type | Description |
|----------|------|-------------|
| `response` | `Task \| Message` | The A2A response |
| `trustInfo` | `TrustInfo` | Trust verification details |
| `agentDid` | `string \| null` | DID of responding agent |
| `agentName` | `string` | Name of responding agent |
| `duration` | `number` | Request duration in ms |

#### Example

```typescript
// Simple string input
const result = await peer.sendByCapability("translation", "Hello, world!");
console.log(result.response);
console.log(`Trust score: ${result.trustInfo.trustScore}`);

// Structured input with options
const result = await peer.sendByCapability(
  "analysis",
  { text: "Analyze this data", data: { metrics: [1, 2, 3] } },
  { blocking: true, timeoutMs: 30000 }
);
```

---

### streamByCapability()

Discover, select, and stream a response by capability. Useful for long-running tasks or real-time updates.

#### Signature

```typescript
async *streamByCapability(
  capability: string,
  input: string | MessageInput,
  options?: SendOptions
): AsyncGenerator<TrustedStreamEvent>
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `capability` | `string` | Capability/skill to discover agents by |
| `input` | `string \| MessageInput` | Message content |
| `options` | `SendOptions` | Optional send configuration |

#### Return Type

`AsyncGenerator<TrustedStreamEvent>` - Async generator yielding stream events.

#### TrustedStreamEvent

| Property | Type | Description |
|----------|------|-------------|
| `event` | `A2AStreamEventData` | The stream event data |
| `kind` | `"message" \| "task" \| "status-update" \| "artifact-update"` | Event type |
| `agentDid` | `string \| null` | DID of responding agent |
| `trustInfo` | `TrustInfo` | Trust verification details |

#### Example

```typescript
for await (const event of peer.streamByCapability("code-generation", prompt)) {
  switch (event.kind) {
    case "status-update":
      console.log(`Status: ${event.event.status.state}`);
      break;
    case "artifact-update":
      console.log(`Artifact: ${event.event.artifact.name}`);
      break;
    case "message":
      console.log(`Message: ${event.event}`);
      break;
  }
}
```

---

## Lifecycle Methods

### on()

Subscribe to lifecycle events. Returns an unsubscribe function.

#### Signature

```typescript
on(
  event: AletheiaEventType | "*",
  handler: AletheiaEventHandler
): () => void
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `event` | `AletheiaEventType \| "*"` | Event type to subscribe to (or `"*"` for all) |
| `handler` | `AletheiaEventHandler` | Callback function for the event |

#### Return Type

`() => void` - Unsubscribe function.

#### Example

```typescript
const unsubscribe = peer.on("task:created", (event) => {
  console.log(`Task created: ${event.taskId}`);
});

// Later: unsubscribe();
```

---

### start()

Start a standalone Express server for the agent.

#### Signature

```typescript
async start(port: number): Promise<void>
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `port` | `number` | Port number to listen on |

#### Return Type

`Promise<void>`

#### Example

```typescript
await peer.start(4000);
console.log("PeerAgent running on port 4000");
```

---

### stop()

Stop the standalone server if running.

#### Signature

```typescript
stop(): void
```

#### Return Type

`void`

#### Example

```typescript
// Graceful shutdown
process.on("SIGTERM", () => {
  peer.stop();
  process.exit(0);
});
```

---

## Accessor Methods

### getAgentCard()

Get the agent's AgentCard (public metadata).

#### Signature

```typescript
getAgentCard(): AgentCard
```

#### Return Type

`AgentCard` - The agent's public metadata card.

#### Example

```typescript
const card = peer.getAgentCard();
console.log(`Agent: ${card.name} v${card.version}`);
```

---

### getRequestHandler()

Get the underlying A2A request handler for custom integrations.

#### Signature

```typescript
getRequestHandler(): A2ARequestHandler
```

#### Return Type

`A2ARequestHandler` - The internal request handler.

#### Example

```typescript
const handler = peer.getRequestHandler();
// Use with custom routing or middleware
```

---

### getTaskStore()

Get the task store instance.

#### Signature

```typescript
getTaskStore(): TaskStore
```

#### Return Type

`TaskStore` - The task storage backend.

#### Example

```typescript
const store = peer.getTaskStore();
const task = await store.get(taskId);
```

---

### getAletheiaExtensions()

Get Aletheia-specific extensions from the agent configuration.

#### Signature

```typescript
getAletheiaExtensions(): AletheiaExtensions | undefined
```

#### Return Type

`AletheiaExtensions | undefined` - Extensions if configured, otherwise undefined.

#### Example

```typescript
const extensions = peer.getAletheiaExtensions();
if (extensions?.trustEndpoint) {
  console.log(`Trust endpoint: ${extensions.trustEndpoint}`);
}
```

---

### getAgent()

Get the underlying `AletheiaAgent` instance (escape hatch for advanced use cases).

#### Signature

```typescript
getAgent(): AletheiaAgent
```

#### Return Type

`AletheiaAgent` - The internal server instance.

#### Example

```typescript
const agent = peer.getAgent();
// Access low-level server APIs
```

---

### getClient()

Get the underlying `AletheiaA2A` client instance (escape hatch for advanced use cases).

#### Signature

```typescript
getClient(): AletheiaA2A
```

#### Return Type

`AletheiaA2A` - The internal client instance.

#### Example

```typescript
const client = peer.getClient();
// Access low-level client APIs
```

---

## Full Example

```typescript
import { PeerAgent } from "@a2aletheia/a2a";

const peer = new PeerAgent({
  registryUrl: "https://registry.aletheia.dev",
  name: "Orchestrator",
  version: "1.0.0",
  url: "https://orchestrator.example.com",
  description: "Routes work to specialist agents",
  skills: [
    { id: "orchestrate", name: "orchestrate", description: "Orchestrate tasks", tags: ["workflow"] }
  ],
  minTrustScore: 0.7,
  requireLive: true,
});

// Handle incoming requests
peer.handle(async (context, response) => {
  // Use outbound client inside the handler
  const result = await peer.sendByCapability("translate", context.textContent);
  response.text(result.response);
});

// Handle cancellation
peer.onCancel(async (taskId) => {
  console.log(`Task ${taskId} cancelled`);
});

// Subscribe to events
peer.on("task:completed", (event) => {
  console.log(`Task completed: ${event.taskId}`);
});

// Start the server
await peer.start(4000);
console.log("PeerAgent listening on port 4000");
```