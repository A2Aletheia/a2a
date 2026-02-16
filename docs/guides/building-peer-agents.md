---
layout: default
title: Building Peer Agents
nav_order: 6
parent: Guides
nav_category: guides
---

# Building Peer Agents

A **PeerAgent** is a full-duplex agent that can both host inbound requests (act as a server) AND call other agents (act as a client). This enables sophisticated multi-agent architectures like orchestrators, routers, and aggregators.

## Overview

`PeerAgent` is the most powerful building block in the `@a2aletheia/a2a` SDK. It combines:

- **Inbound capabilities** — Respond to requests from other agents via A2A protocol
- **Outbound capabilities** — Call other agents with trust verification

Common use cases:

- **Orchestrator agents** — Route tasks to specialist agents based on content
- **Aggregator agents** — Combine results from multiple agents
- **Gateway agents** — Translate between protocols or add middleware
- **Coordinator agents** — Manage workflows across multiple agents

## Architecture

`PeerAgent` is a composition of two core components:

```
┌─────────────────────────────────────────────┐
│                  PeerAgent                   │
│                                             │
│  ┌───────────────┐    ┌───────────────────┐ │
│  │ AletheiaAgent │    │   AletheiaA2A     │ │
│  │   (server)    │    │    (client)       │ │
│  │               │    │                   │ │
│  │ • handle()    │    │ • discover()      │ │
│  │ • onCancel()  │    │ • connect()       │ │
│  │ • handleReq() │    │ • sendByCap()     │ │
│  │ • start()     │    │ • streamByCap()   │ │
│  └───────────────┘    └───────────────────┘ │
│         ▲                     ▲             │
│         │                     │             │
│    Inbound traffic      Outbound traffic    │
└─────────────────────────────────────────────┘
```

- **AletheiaAgent** — Handles incoming A2A protocol requests, manages task lifecycle
- **AletheiaA2A** — Discovers and calls other agents with trust verification

## Creating a PeerAgent

### PeerAgentConfig Interface

```typescript
import { PeerAgent, type PeerAgentConfig } from "@a2aletheia/a2a";

const config: PeerAgentConfig = {
  // Registry URL (shared by server and client)
  registryUrl: "https://registry.aletheia.dev",

  // Server-side configuration (AletheiaAgent)
  name: "Orchestrator",
  version: "1.0.0",
  url: "https://orchestrator.example.com",
  description: "Routes tasks to specialist agents",
  skills: [
    {
      id: "orchestrate",
      name: "orchestrate-tasks",
      description: "Route tasks to appropriate specialist agents",
      tags: ["orchestration", "routing"],
    },
  ],
  
  // Optional server config
  defaultInputModes: ["text/plain", "application/json"],
  defaultOutputModes: ["text/plain", "application/json"],
  capabilities: {
    streaming: true,
    pushNotifications: false,
  },
  iconUrl: "https://orchestrator.example.com/icon.png",
  documentationUrl: "https://docs.example.com/orchestrator",
  provider: {
    organization: "Example Corp",
    url: "https://example.com",
  },
  aletheiaExtensions: {
    did: "did:web:orchestrator.example.com",
    owner: "0x1234...",
    livenessPingUrl: "https://orchestrator.example.com/health",
  },
  taskStore: customTaskStore, // Optional: Redis, etc.

  // Client-side configuration (AletheiaA2A)
  agentSelector: customSelector, // Optional: custom selection logic
  minTrustScore: 0.7,            // Minimum trust score for outbound calls
  requireLive: true,             // Only call agents passing liveness checks
  livenessCheckBeforeSend: true, // Verify liveness before each call
  verifyIdentity: true,          // Verify DIDs before connecting
  authToken: "your-registry-token", // Optional: for authenticated discovery

  // Observability (BYOL - Bring Your Own Logger)
  logger: customLogger,
  logLevel: "debug",
};
```

### Minimal Example

```typescript
import { PeerAgent } from "@a2aletheia/a2a";

const peer = new PeerAgent({
  name: "Router",
  version: "1.0.0",
  url: "https://router.example.com",
  description: "Routes messages to handlers",
  skills: [{ id: "route", name: "route", description: "Route messages", tags: [] }],
  minTrustScore: 0.5,
});
```

## Inbound: Handling Requests

Use `handle()` to register a message handler that processes incoming requests.

### AgentHandler Signature

```typescript
type AgentHandler = (
  context: AgentContext,
  response: AgentResponse,
) => Promise<void>;
```

The `AgentContext` provides access to the incoming message:

```typescript
interface AgentContext {
  readonly taskId: string;
  readonly contextId: string;
  readonly textContent: string;              // All text parts joined
  readonly dataContent: Record<string, unknown> | null; // First data part
  readonly parts: Part[];                    // Raw message parts
  readonly message: Message;                 // Full A2A message
}
```

### ResponseBuilder API

The `AgentResponse` provides methods for building responses:

#### Quick Responses (Auto-complete)

```typescript
peer.handle(async (context, response) => {
  // Simple text response
  response.text("Hello from the agent!");

  // JSON data response
  response.data({ result: "success", count: 42 });

  // Custom parts
  response.message([
    { kind: "text", text: "Here's the result:" },
    { kind: "data", data: { value: 123 } },
  ]);
});
```

#### Streaming Responses

For long-running tasks, use streaming:

```typescript
peer.handle(async (context, response) => {
  // Signal we're working
  response.working("Processing your request...");

  // Stream artifacts as they're generated
  for (const chunk of processLargeData(context.textContent)) {
    response.artifact(
      {
        name: "output.txt",
        mimeType: "text/plain",
        parts: [{ kind: "text", text: chunk }],
      },
      { append: true, lastChunk: false },
    );
  }

  // Mark final artifact chunk
  response.artifact(finalArtifact, { lastChunk: true });

  // Complete the task
  response.done("Processing complete!");
});
```

#### Status States

```typescript
peer.handle(async (context, response) => {
  // Working state (non-final)
  response.working("Analyzing...");

  // Completed (final)
  response.done("Analysis complete");

  // Failed (final)
  response.fail("Something went wrong");

  // Canceled (final)
  response.canceled();

  // Input required (non-final) - pause for user input
  response.inputRequired("Please provide additional information");
});
```

### Using onCancel() for Cancellation

Handle task cancellation requests:

```typescript
peer.handle(async (context, response) => {
  const abortController = new AbortController();
  
  // Store controller for cancellation
  activeTasks.set(context.taskId, abortController);

  try {
    const result = await longRunningProcess(
      context.textContent,
      abortController.signal,
    );
    response.text(result);
  } finally {
    activeTasks.delete(context.taskId);
  }
});

peer.onCancel(async (taskId, response) => {
  const controller = activeTasks.get(taskId);
  if (controller) {
    controller.abort();
    activeTasks.delete(taskId);
  }
  response.canceled();
});
```

## Outbound: Calling Other Agents

Use client methods within your handler to call other agents.

### discover()

Find agents matching criteria:

```typescript
peer.handle(async (context, response) => {
  // Discover by capability
  const translators = await peer.discover({
    capability: "translate",
    minTrustScore: 0.8,
    isLive: true,
    limit: 5,
  });

  // Discover by query
  const agents = await peer.discover({
    query: "code analysis",
    limit: 10,
  });

  response.text(`Found ${translators.length} translators`);
});
```

### connect()

Establish a persistent connection to an agent:

```typescript
peer.handle(async (context, response) => {
  // Connect by DID (with trust verification)
  const trustedAgent = await peer.connect(
    "did:web:translator.example.com",
  );

  // Send a message
  const result = await trustedAgent.send("Translate this text");
  
  response.text(result.response.parts[0].text);
});
```

### connectByUrl()

Connect without trust verification (for testing or trusted networks):

```typescript
peer.handle(async (context, response) => {
  const agent = await peer.connectByUrl(
    "https://internal-agent.local:3000",
  );
  
  const result = await agent.send(context.textContent);
  response.text(result.response.parts[0].text);
});
```

### sendByCapability()

One-shot discovery, selection, and send:

```typescript
peer.handle(async (context, response) => {
  // Automatically discovers, selects best agent, and sends
  const result = await peer.sendByCapability(
    "translate",                    // Capability to find
    context.textContent,            // Message (string or MessageInput)
    { timeoutMs: 30000 },           // Options
  );

  console.log("Trust info:", result.trustInfo);
  console.log("Agent:", result.agentName);
  
  response.text(result.response.parts[0].text);
});
```

### streamByCapability()

Stream responses from long-running tasks:

```typescript
peer.handle(async (context, response) => {
  response.working("Streaming from specialist agent...");

  for await (const event of peer.streamByCapability(
    "analyze",
    { text: context.textContent },
  )) {
    switch (event.kind) {
      case "status-update":
        if (event.event.status.state === "working") {
          response.working("Agent is working...");
        }
        break;
      case "artifact-update":
        response.artifact(event.event.artifact);
        break;
    }
  }

  response.done("Streaming complete");
});
```

## Lifecycle Events

Subscribe to lifecycle events for observability:

```typescript
import type { AletheiaEventType } from "@a2aletheia/sdk";

peer.on("agent.start", (event) => {
  console.log("Agent started:", event.data);
});

peer.on("message.received", (event) => {
  metrics.increment("messages.received");
});

peer.on("trust.verified", (event) => {
  console.log("Trust verified for:", event.data?.agentDid);
});

peer.on("trust.failed", (event) => {
  console.error("Trust verification failed:", event.data);
});

// Wildcard - receive all events
peer.on("*", (event) => {
  analytics.track(`aletheia.${event.type}`, event.data);
});
```

### Available Event Types

| Event | Description |
|-------|-------------|
| `agent.start` | Agent server started |
| `agent.stop` | Agent server stopped |
| `message.received` | Incoming message received |
| `message.sent` | Outbound message sent |
| `message.failed` | Message delivery failed |
| `trust.verified` | Trust verification succeeded |
| `trust.failed` | Trust verification failed |
| `rating.submitted` | Rating submitted to registry |
| `rating.received` | Rating received from registry |
| `discovery.search` | Agent discovery initiated |
| `discovery.connect` | Connected to an agent |
| `liveness.check` | Liveness check initiated |
| `liveness.result` | Liveness check result |

## Starting the Server

### Standalone Express Server

```typescript
await peer.start(4000);
console.log("PeerAgent listening on port 4000");
```

### Graceful Shutdown

```typescript
process.on("SIGTERM", () => {
  peer.stop();
  process.exit(0);
});
```

## Framework Integration

Use `handleRequest()` for custom HTTP frameworks:

### Hono Example

```typescript
import { Hono } from "hono";
import { PeerAgent } from "@a2aletheia/a2a";

const app = new Hono();
const peer = new PeerAgent({ /* config */ });

peer.handle(async (context, response) => {
  response.text("Hello from Hono!");
});

// Handle A2A requests
app.all("/", async (c) => {
  const body = await c.req.json();
  const result = await peer.handleRequest(body);

  // Streaming response
  if (Symbol.asyncIterator in Object(result)) {
    return new Response(
      new ReadableStream({
        async start(controller) {
          for await (const chunk of result as AsyncGenerator) {
            controller.enqueue(
              new TextEncoder().encode(JSON.stringify(chunk) + "\n"),
            );
          }
          controller.close();
        },
      }),
      {
        headers: {
          "Content-Type": "application/jsonl",
        },
      },
    );
  }

  // Regular response
  return c.json(result);
});

// Serve agent card
app.get("/.well-known/agent.json", (c) => {
  return c.json(peer.getAgentCard());
});

export default app;
```

### Fastify Example

```typescript
import Fastify from "fastify";
import { PeerAgent } from "@a2aletheia/a2a";

const fastify = Fastify();
const peer = new PeerAgent({ /* config */ });

peer.handle(async (context, response) => {
  const result = await peer.sendByCapability("translate", context.textContent);
  response.text(result.response.parts[0].text);
});

fastify.post("/", async (request, reply) => {
  const result = await peer.handleRequest(request.body);

  if (Symbol.asyncIterator in Object(result)) {
    reply.type("application/jsonl");
    return reply.send(
      async function* () {
        for await (const chunk of result as AsyncGenerator) {
          yield JSON.stringify(chunk) + "\n";
        }
      }(),
    );
  }

  return result;
});

fastify.get("/.well-known/agent.json", async () => {
  return peer.getAgentCard();
});

await fastify.listen({ port: 4000 });
```

## Complete Example

Full orchestrator agent that routes to specialist agents:

```typescript
import {
  PeerAgent,
  type PeerAgentConfig,
  AgentNotFoundError,
} from "@a2aletheia/a2a";

const config: PeerAgentConfig = {
  registryUrl: "https://registry.aletheia.dev",
  
  name: "Orchestrator",
  version: "1.0.0",
  url: "https://orchestrator.example.com",
  description: "Routes tasks to specialist agents based on content",
  skills: [
    {
      id: "orchestrate",
      name: "orchestrate",
      description: "Route tasks to specialist agents",
      tags: ["orchestration", "routing", "multi-agent"],
    },
  ],
  capabilities: { streaming: true },
  aletheiaExtensions: {
    did: "did:web:orchestrator.example.com",
    livenessPingUrl: "https://orchestrator.example.com/health",
  },
  
  minTrustScore: 0.7,
  requireLive: true,
  livenessCheckBeforeSend: true,
  verifyIdentity: true,
  
  logLevel: "info",
};

const peer = new PeerAgent(config);

// Map keywords to capabilities
const ROUTING_RULES: Record<string, string> = {
  translate: "translate",
  translation: "translate",
  analyze: "analyze",
  analysis: "analyze",
  code: "code-review",
  review: "code-review",
  summarize: "summarize",
  summary: "summarize",
};

function detectCapability(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [keyword, capability] of Object.entries(ROUTING_RULES)) {
    if (lower.includes(keyword)) {
      return capability;
    }
  }
  return null;
}

peer.handle(async (context, response) => {
  const text = context.textContent;
  const capability = detectCapability(text);

  if (!capability) {
    response.text(
      "I can help with translation, analysis, code review, and summarization. " +
      "Please specify what you'd like to do.",
    );
    return;
  }

  response.working(`Routing to ${capability} specialist...`);

  try {
    // Stream response from specialist
    for await (const event of peer.streamByCapability(capability, text)) {
      switch (event.kind) {
        case "status-update":
          const status = event.event.status.state;
          if (status === "working") {
            response.working(`${capability} agent is processing...`);
          }
          break;

        case "artifact-update":
          response.artifact(event.event.artifact, {
            append: event.event.append,
            lastChunk: event.event.lastChunk,
          });
          break;

        case "message":
          // Forward the message
          response.message(event.event.parts);
          return;
      }
    }

    response.done(`${capability} task completed`);
  } catch (error) {
    if (error instanceof AgentNotFoundError) {
      response.fail(`No ${capability} agents available. Please try again later.`);
    } else {
      response.fail(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
});

// Optional: Handle cancellation
peer.onCancel(async (taskId, response) => {
  console.log(`Task ${taskId} cancelled`);
  response.canceled();
});

// Observability
peer.on("message.received", (event) => {
  console.log(`Received: ${event.data?.taskId}`);
});

peer.on("trust.failed", (event) => {
  console.error(`Trust failed: ${event.data?.reason}`);
});

// Start the server
await peer.start(4000);
console.log("Orchestrator agent running on port 4000");
```

## Escape Hatches

For advanced use cases, access the underlying components:

### getAgent()

Get the underlying `AletheiaAgent` for server-side operations:

```typescript
const agent = peer.getAgent();

// Access the Express request handler
const handler = agent.getRequestHandler();

// Get the task store
const store = agent.getTaskStore();

// Get agent card
const card = agent.getAgentCard();
```

### getClient()

Get the underlying `AletheiaA2A` client for advanced client operations:

```typescript
const client = peer.getClient();

// Clear connection caches
client.clearConnections();

// Disconnect a specific agent
client.disconnectAgent("did:web:agent.example.com");

// Access the logger
client.logger.debug("Custom debug message");
```

## Best Practices

### Error Handling in Handlers

Always handle errors gracefully:

```typescript
peer.handle(async (context, response) => {
  try {
    const result = await peer.sendByCapability("analyze", context.textContent);
    response.text(result.response.parts[0].text);
  } catch (error) {
    if (error instanceof AgentNotFoundError) {
      response.fail("No suitable agents found. Try again later.");
    } else if (error instanceof A2AProtocolError) {
      response.fail(`Protocol error: ${error.message}`);
    } else {
      response.fail("An unexpected error occurred");
      // Log full error for debugging
      peer.getClient().logger.error("Handler error", error);
    }
  }
});
```

### Context Management

Reuse context IDs for multi-turn conversations:

```typescript
peer.handle(async (context, response) => {
  // First call establishes context
  const result1 = await peer.sendByCapability(
    "translate",
    { text: context.textContent, contextId: context.contextId },
  );

  // Follow-up uses same context
  const result2 = await peer.sendByCapability(
    "translate",
    { 
      text: "Now translate to Spanish",
      contextId: result1.response.contextId,
      taskId: result1.response.id,
    },
  );

  response.text(result2.response.parts[0].text);
});
```

### Timeout Configuration

Set appropriate timeouts for outbound calls:

```typescript
const result = await peer.sendByCapability("analyze", input, {
  timeoutMs: 60000,  // 60 seconds for long analysis
  blocking: true,    // Wait for completion
});
```

### Resource Cleanup

Always clean up resources on shutdown:

```typescript
const activeConnections = new Map<string, AbortController>();

peer.onCancel(async (taskId, response) => {
  activeConnections.get(taskId)?.abort();
  activeConnections.delete(taskId);
  response.canceled();
});

process.on("SIGTERM", () => {
  // Abort all active tasks
  for (const controller of activeConnections.values()) {
    controller.abort();
  }
  peer.stop();
  process.exit(0);
});
```

### Streaming Best Practices

When streaming to downstream agents:

```typescript
peer.handle(async (context, response) => {
  response.working("Starting pipeline...");

  try {
    for await (const event of peer.streamByCapability("analyze", context.textContent)) {
      // Don't block the stream with slow operations
      if (event.kind === "artifact-update") {
        response.artifact(event.event.artifact);
      }
    }
    response.done();
  } catch (error) {
    // Use fail() to properly terminate the stream
    response.fail(error instanceof Error ? error.message : "Stream failed");
  }
});
```