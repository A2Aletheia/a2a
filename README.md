# @a2aletheia/a2a

Server-side client and peer-agent utilities for working with Aletheia-registered A2A agents.

This package wraps `@a2a-js/sdk` with Aletheia registry lookup, trust checks, connection reuse, and optional context persistence.

## Installation

```bash
pnpm add @a2aletheia/a2a
```

## Exports

The main entry point exports:

- `AletheiaA2A` for outbound discovery, connection, send, and stream flows
- `PeerAgent` for full-duplex agents that both host an A2A server and call other agents
- `TrustedAgent` for connection reuse and task operations
- built-in selectors: `HighestTrustSelector`, `RandomSelector`, `FirstMatchSelector`
- `redisContextStore` for persisting `contextId` and `taskId`
- sender identity, user delegation, and flow helper utilities

## Quick Start

```ts
import { AletheiaA2A } from "@a2aletheia/a2a";

const client = new AletheiaA2A();

const result = await client.sendByCapability(
  "translate-text",
  "Translate 'hello' to Spanish.",
);

console.log(result.agentName);
console.log(result.trustInfo);
console.log(result.response);
```

## Connection API

```ts
import { AletheiaA2A } from "@a2aletheia/a2a";

const client = new AletheiaA2A();

const agent = await client.connect("did:key:z6MkExample");
const response = await agent.send("Summarize this document.");

console.log(agent.contextId);
console.log(response.trustInfo);
```

`connectByUrl()` is also available, but it resolves a registered agent by URL through the Aletheia registry before connecting. It does not open arbitrary URLs directly.

```ts
const agent = await client.connectByUrl("https://agent.example.com");
```

## Trust Behavior

`AletheiaA2A` applies the package trust pipeline before establishing a reusable connection:

- optional identity verification
- optional liveness requirement
- minimum trust score filtering

The resulting `TrustInfo` is attached to `TrustedResponse` and streamed events.

## Context Persistence

`TrustedAgent` tracks the latest `contextId` and `taskId`. If you provide a `contextStore`, that state is restored across process restarts.

```ts
import Redis from "ioredis";
import { AletheiaA2A, redisContextStore } from "@a2aletheia/a2a";

const redis = new Redis(process.env.REDIS_URL!);

const client = new AletheiaA2A({
  contextStore: redisContextStore(redis, { ttlSeconds: 3600 }),
});
```

## PeerAgent

`PeerAgent` combines the SDK agent host with the outbound `AletheiaA2A` client.

```ts
import { PeerAgent } from "@a2aletheia/a2a";

const peer = new PeerAgent({
  name: "Orchestrator",
  version: "1.0.0",
  url: "https://orchestrator.example.com",
  description: "Routes tasks to specialist agents",
  skills: [
    {
      id: "orchestrate",
      name: "Orchestrate",
      description: "Coordinate work across agents",
      tags: [],
    },
  ],
});

peer.handle(async (context, response) => {
  const result = await peer.sendByCapability("translate-text", context.textContent);
  response.text(`Handled by ${result.agentName}`);
});
```

## Selected Configuration

Common `AletheiaA2A` options:

- `registryUrl`
- `agentSelector`
- `minTrustScore`
- `requireLive`
- `livenessCheckBeforeSend`
- `verifyIdentity`
- `authToken`
- `contextStore`
- `preferredTransports`
- `authenticationHandler`
- `interceptors`
- `polling`
- `signOutboundMessages`
- `signingIdentity`

## Task and Connection Operations

`TrustedAgent` exposes:

- `send()`
- `stream()`
- `getTask()`
- `cancelTask()`
- `resubscribeTask()`
- push notification config helpers
- `refreshCard()`
- `refreshTrust()`
- `resetContext()`

## Error Types

The package exports structured errors including:

- `AgentNotFoundError`
- `DIDResolutionError`
- `AgentNotLiveError`
- `TrustScoreBelowThresholdError`
- `A2AProtocolError`

## License

Licensed under [MIT](LICENSE).
