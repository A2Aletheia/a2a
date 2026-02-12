# @a2aletheia/a2a

> **This is a 90% vibe-coded proof of concept. Open PR for smells.**

Server-side package that wraps [`@a2a-js/sdk`](https://www.npmjs.com/package/@a2a-js/sdk) with Aletheia's trust and identity layer. Requestors import this instead of `@a2a-js/sdk` directly.

> **Staging:** Defaults to the Aletheia staging network on Base Sepolia (`https://aletheia-api.vercel.app`, chain `84532`). Browse the registry at https://aletheia-psi.vercel.app.

## Installation

```bash
pnpm add @a2aletheia/a2a
```

## Quick Start

```typescript
import { AletheiaA2A } from "@a2aletheia/a2a";

// Zero-config — connects to the Aletheia staging network by default
const a2a = new AletheiaA2A();

// High-level: discover + verify + send in one call
const response = await a2a.sendByCapability(
  "translate-text",
  "Translate hello to Spanish",
);
console.log(response.response); // Task or Message
console.log(response.trustInfo); // DID verified, liveness, trust score

// Streaming
const stream = a2a.streamByCapability(
  "translate-text",
  "Translate this document...",
);
for await (const event of stream) {
  console.log(event.kind, event.event);
}
```

## Connection-based API

Get a handle to a verified agent and reuse it for multiple messages:

```typescript
// Connect by DID (full trust verification)
const agent = await a2a.connect("did:web:translate.example.com");
const response = await agent.send("Translate hello to Spanish");

// Connect by URL (skip registry, limited trust info)
const agent = await a2a.connectByUrl("https://translate.example.com");
const response = await agent.send("Translate hello to Spanish");

// Streaming
for await (const event of agent.stream("Translate this document...")) {
  console.log(event.kind, event.event);
}

// Task management
const task = await agent.getTask("task-id");
const canceled = await agent.cancelTask("task-id");
```

## Configuration

```typescript
interface AletheiaA2AConfig {
  registryUrl?: string; // Aletheia registry API URL (defaults to staging)
  agentSelector?: AgentSelector; // Default: HighestTrustSelector
  minTrustScore?: number; // Default: 0
  requireLive?: boolean; // Default: true
  livenessCheckBeforeSend?: boolean; // Default: false (rely on registry cache)
  verifyIdentity?: boolean; // Default: true
  authToken?: string; // SIWE session token
}
```

## Agent Selectors

Three built-in strategies for choosing among discovered agents:

```typescript
import {
  HighestTrustSelector, // Default — highest trustScore, tie-break by liveness
  RandomSelector, // Random pick
  FirstMatchSelector, // First result (registry ordering)
} from "@a2aletheia/a2a";

const a2a = new AletheiaA2A({
  agentSelector: new RandomSelector(),
});
```

## Trust Pipeline

Every `connect()` and `sendByCapability()` call runs through the trust pipeline:

1. **DID Resolution** — verifies the agent's DID resolves (skippable via `verifyIdentity: false`)
2. **Liveness Check** — confirms the agent is reachable (fresh check via `livenessCheckBeforeSend: true`, or cached via `requireLive: true`)
3. **Trust Score Gate** — rejects agents below `minTrustScore`

Trust verification happens at **connection time**, not per-message. Stream events carry the `TrustInfo` snapshot from connection.

## Error Handling

```typescript
import {
  AletheiaA2AError, // Base class
  AgentNotFoundError, // No agents match capability/criteria
  DIDResolutionError, // DID resolution failed
  AgentNotLiveError, // Agent not reachable
  TrustScoreBelowThresholdError, // Trust score below threshold
  A2AProtocolError, // JSON-RPC error from A2A protocol
} from "@a2aletheia/a2a";

try {
  await a2a.sendByCapability("translate-text", "Hello");
} catch (err) {
  if (err instanceof AgentNotFoundError) {
    // No agents with "translate-text" capability
  }
  if (err instanceof A2AProtocolError) {
    console.error(err.rpcCode, err.message);
  }
}
```

## Re-exported Types

All essential A2A protocol types are re-exported so consumers never need to depend on `@a2a-js/sdk`:

```typescript
import type {
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
  A2AClient,
  A2AStreamEventData,
} from "@a2aletheia/a2a";
```

## Scope (v0.1.0)

**Included:** Discovery, DID verification, liveness checks, trust score gating, send/stream messaging, connection handles, agent selection strategies.

**Not included:** Server-side agent hosting, retry/circuit-breaker, connection pooling, response caching, multi-agent fan-out, payment integration, response signature verification, push notifications.

## License

Licensed under [AGPL-3.0-only](https://www.gnu.org/licenses/agpl-3.0.html)
