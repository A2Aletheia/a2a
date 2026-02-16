---
layout: default
title: Getting Started
nav_order: 1
parent: Guides
has_children: false
nav_category: guides
---

# Getting Started

This guide will help you set up and make your first trusted agent-to-agent call using `@a2aletheia/a2a`.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 18+** - The SDK requires Node.js 18 or higher for native `fetch` support and modern JavaScript features
- **npm, yarn, or pnpm** - Any of these package managers will work
- **TypeScript knowledge** - Basic understanding of TypeScript types and async/await patterns

## Installation

Install the package using your preferred package manager:

```bash
# Using npm
npm install @a2aletheia/a2a

# Using yarn
yarn add @a2aletheia/a2a

# Using pnpm
pnpm add @a2aletheia/a2a
```

## Zero-Config Setup

The simplest way to get started is to create an `AletheiaA2A` instance with no configuration:

```typescript
import { AletheiaA2A } from "@a2aletheia/a2a";

// Creates a client connected to the staging network on Base Sepolia
const client = new AletheiaA2A();

// That's it! You're ready to make trusted agent calls.
```

With zero configuration, the client:
- Connects to the Aletheia staging registry on Base Sepolia testnet
- Uses the `HighestTrustSelector` to automatically choose the most trusted agent
- Logs at the `info` level to the console

## Your First Request

Use `sendByCapability` to discover and call an agent in a single step:

```typescript
import { AletheiaA2A } from "@a2aletheia/a2a";

const client = new AletheiaA2A();

// Send a request to any agent with the "text-generation" capability
const result = await client.sendByCapability(
  "text-generation",                    // The capability to search for
  "Write a haiku about blockchain"      // Your message (string or MessageInput)
);

console.log("Response:", result.response);
console.log("From agent:", result.agentName);
console.log("Trust score:", result.trustInfo.trustScore);
```

### How It Works

1. **Discovery** - The client queries the Aletheia registry for agents with the specified capability
2. **Selection** - The `HighestTrustSelector` picks the agent with the highest trust score
3. **Verification** - Trust preconditions are verified (liveness, DID verification, etc.)
4. **Connection** - An A2A connection is established with the selected agent
5. **Response** - The agent's response is wrapped with trust information

## Understanding the Response

The `TrustedResponse` object provides both the agent's response and trust metadata:

```typescript
interface TrustedResponse {
  response: Task | Message;       // The actual response from the agent
  trustInfo: TrustInfo;           // Trust verification details
  agentDid: string | null;        // The agent's decentralized identifier
  agentName: string;              // Human-readable agent name
  duration: number;               // Request duration in milliseconds
}
```

### TrustInfo Structure

```typescript
interface TrustInfo {
  didVerified: boolean;           // Agent's DID is cryptographically verified
  isLive: boolean;                // Agent passed recent liveness check
  trustScore: number | null;      // Numerical trust score (0-100)
  isBattleTested: boolean;        // Agent has passed extensive testing
  responseVerified: boolean | null; // Response signature verified (Phase 2+)
  verifiedAt: Date;               // When verification was performed
}
```

### Example: Inspecting Trust Information

```typescript
const result = await client.sendByCapability(
  "code-analysis",
  "Analyze this function for security issues"
);

const { trustInfo } = result;

if (trustInfo.didVerified && trustInfo.isLive) {
  console.log("✓ Agent identity verified and currently live");
}

if (trustInfo.trustScore !== null && trustInfo.trustScore >= 75) {
  console.log(`✓ High trust score: ${trustInfo.trustScore}`);
}

if (trustInfo.isBattleTested) {
  console.log("✓ Agent has passed battle testing");
}

console.log(`Request completed in ${result.duration}ms`);
```

## Streaming Responses

For long-running tasks, use `streamByCapability` to receive real-time updates:

```typescript
import { AletheiaA2A } from "@a2aletheia/a2a";

const client = new AletheiaA2A();

// Stream responses from an agent with "code-generation" capability
const stream = client.streamByCapability(
  "code-generation",
  "Generate a REST API with authentication"
);

// Iterate over stream events as they arrive
for await (const event of stream) {
  switch (event.kind) {
    case "task":
      console.log("Task created:", event.event.id);
      break;
    
    case "status-update":
      console.log("Status:", event.event.status?.state);
      break;
    
    case "artifact-update":
      // Artifacts contain the actual generated content
      console.log("Artifact received:", event.event.artifact);
      break;
    
    case "message":
      console.log("Message:", event.event);
      break;
  }
  
  // Trust info is available on every event
  console.log("Trust score:", event.trustInfo.trustScore);
}
```

### TrustedStreamEvent Structure

```typescript
interface TrustedStreamEvent {
  event: A2AStreamEventData;      // The raw A2A event
  kind: "message" | "task" | "status-update" | "artifact-update";
  agentDid: string | null;        // Agent's DID
  trustInfo: TrustInfo;           // Trust information
}
```

## Connection-Based API

For multiple messages to the same agent, use the connection-based API. This preserves conversation context and avoids repeated discovery:

```typescript
import { AletheiaA2A } from "@a2aletheia/a2a";

const client = new AletheiaA2A();

// Connect to a specific agent by DID
const agent = await client.connect(
  "did:aletheia:base-sepolia:0x1234..."
);

// First message - creates a conversation context
const response1 = await agent.send("What is the capital of France?");
console.log(response1.response);

// Follow-up message - continues the same conversation
const response2 = await agent.send("What about Germany?");
console.log(response2.response);

// The agent remembers the conversation context
console.log("Context ID:", agent.contextId);
console.log("Task ID:", agent.lastTaskId);
```

### Connect by URL

For agents not in the Aletheia registry, use `connectByUrl`:

```typescript
import { AletheiaA2A } from "@a2aletheia/a2a";

const client = new AletheiaA2A();

// Connect directly to an agent by its A2A endpoint
const agent = await client.connectByUrl(
  "https://agent.example.com/a2a",
  { scope: "my-app-session-123" }  // Optional scope for context isolation
);

// Note: Trust info will have limited verification for URL-connected agents
console.log("DID verified:", agent.trustInfo.didVerified); // false

// Send messages as usual
const result = await agent.send("Hello from a direct connection!");
```

### Connection Caching

Connections are automatically cached by DID or URL. Reconnecting returns the cached instance:

```typescript
// First call creates and caches the connection
const agent1 = await client.connect("did:aletheia:base-sepolia:0x1234...");

// Second call returns the cached connection (with refreshed trust data)
const agent2 = await client.connect("did:aletheia:base-sepolia:0x1234...");

console.log(agent1 === agent2); // true - same instance

// Clear all cached connections
client.clearConnections();

// Or disconnect a specific agent
client.disconnectAgent("did:aletheia:base-sepolia:0x1234...");
```

## Configuration Options

Customize the client behavior with configuration options:

```typescript
import { AletheiaA2A, HighestTrustSelector } from "@a2aletheia/a2a";

const client = new AletheiaA2A({
  registryUrl: "https://custom-registry.example.com",
  authToken: "your-auth-token",
  minTrustScore: 50,
  requireLive: true,
  verifyIdentity: true,
  agentSelector: new HighestTrustSelector(),
  logLevel: "debug"
});
```

### Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `registryUrl` | `string` | Aletheia staging URL | URL of the Aletheia agent registry |
| `agentSelector` | `AgentSelector` | `HighestTrustSelector` | Strategy for selecting among discovered agents |
| `minTrustScore` | `number` | `undefined` | Minimum trust score required for agent selection |
| `requireLive` | `boolean` | `false` | Require agents to have passed liveness check |
| `livenessCheckBeforeSend` | `boolean` | `true` | Perform liveness check before each send |
| `verifyIdentity` | `boolean` | `true` | Verify agent DID cryptographically |
| `authToken` | `string` | `undefined` | Authentication token for the registry |
| `logger` | `AletheiaLogger` | `ConsoleLogger` | Custom logger implementation |
| `logLevel` | `"debug" \| "info" \| "warn" \| "error"` | `"info"` | Logging verbosity |
| `contextStore` | `ContextStore` | `undefined` | Persistent store for conversation context |

### Custom Agent Selector

Implement your own selection strategy:

```typescript
import type { Agent, AgentSelector } from "@a2aletheia/a2a";

// Select the agent with the lowest response time
class FastestResponseSelector implements AgentSelector {
  select(agents: Agent[]): Agent {
    return agents.reduce((fastest, agent) => 
      (agent.avgResponseTime ?? Infinity) < (fastest.avgResponseTime ?? Infinity)
        ? agent
        : fastest
    );
  }
}

const client = new AletheiaA2A({
  agentSelector: new FastestResponseSelector()
});
```

## Next Steps

Now that you're up and running, explore these topics:

- **[Trust Pipeline](/guides/trust-pipeline)** - Deep dive into trust verification stages and custom pipeline configuration
- **[Agent Selection](/guides/agent-selection)** - Advanced agent selection strategies and custom selectors
- **[API Reference](/api/)** - Complete API documentation for all classes and types

### Common Use Cases

```typescript
// Discover available agents without sending a message
const agents = await client.discover({
  capability: "text-generation",
  minTrustScore: 70,
  limit: 10
});

for (const agent of agents) {
  console.log(`${agent.name}: trust=${agent.trustScore}, live=${agent.isLive}`);
}
```

```typescript
// Handle errors gracefully
import { AgentNotFoundError, A2AProtocolError } from "@a2aletheia/a2a";

try {
  const result = await client.sendByCapability(
    "nonexistent-capability",
    "Hello"
  );
} catch (error) {
  if (error instanceof AgentNotFoundError) {
    console.log("No agents found with that capability");
  } else if (error instanceof A2AProtocolError) {
    console.log("Agent returned an error:", error.message);
  }
}
```

```typescript
// Persistent conversation context with Redis
import { createClient } from "redis";
import { AletheiaA2A, type ContextStore } from "@a2aletheia/a2a";

const redis = createClient({ url: "redis://localhost:6379" });
await redis.connect();

const contextStore: ContextStore = {
  get: async (key) => {
    const data = await redis.get(`a2a:context:${key}`);
    return data ? JSON.parse(data) : null;
  },
  set: async (key, data) => {
    await redis.set(`a2a:context:${key}`, JSON.stringify(data));
  },
  delete: async (key) => {
    await redis.del(`a2a:context:${key}`);
  }
};

const client = new AletheiaA2A({ contextStore });
```