---
layout: default
title: Trust Pipeline
nav_order: 2
parent: Guides
nav_category: guides
---

# Trust Pipeline

Every `connect()` and `sendByCapability()` call flows through the trust pipeline—a multi-stage verification system that ensures agents are authentic, reachable, and trustworthy before any message is sent.

## Overview

The trust pipeline is your first line of defense against:

- **Identity spoofing**: Malicious agents claiming to be someone they're not
- **Stale connections**: Sending messages to offline or unresponsive agents
- **Untrusted agents**: Interacting with low-reputation or unverified agents

The pipeline executes three verification stages in sequence:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  DID Resolution │ -> │ Liveness Check  │ -> │ Trust Score Gate│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

If any stage fails, the pipeline throws an error and the message is not sent.

```typescript
import { AletheiaA2AClient } from "@a2aletheia/a2a";

const client = new AletheiaA2AClient({
  registryUrl: "https://registry.example.com",
  verifyIdentity: true,      // Stage 1: Enable DID verification
  requireLive: true,        // Stage 2: Require live agents
  minTrustScore: 50,        // Stage 3: Minimum trust threshold
});

// All calls go through the trust pipeline automatically
await client.connect("did:example:agent-123");
await client.sendByCapability("text-generation", "Hello!");
```

## Stage 1: DID Resolution

The first stage verifies that the agent's Decentralized Identifier (DID) resolves correctly in the registry. This confirms the agent's identity is authentic and registered.

### What It Checks

- The DID exists in the registry
- The DID document is well-formed and valid
- The agent's public keys can be retrieved for future signature verification

```typescript
// DID resolution happens automatically during connect()
const agent = await client.connect("did:example:agent-123");
// If DID doesn't resolve, throws DIDResolutionError
```

### Skipping DID Verification

In development or testing environments, you may want to skip DID verification:

```typescript
const client = new AletheiaA2AClient({
  registryUrl: "https://registry.example.com",
  verifyIdentity: false,  // Skip DID resolution stage
});
```

{: .warning }
Setting `verifyIdentity: false` disables identity verification entirely. Use only in trusted development environments.

### Error: DIDResolutionError

When DID resolution fails, the pipeline throws a `DIDResolutionError`:

```typescript
import { DIDResolutionError } from "@a2aletheia/a2a";

try {
  await client.connect("did:example:invalid-did");
} catch (error) {
  if (error instanceof DIDResolutionError) {
    console.error("DID verification failed:", error.message);
    console.error("Error code:", error.code); // "DID_RESOLUTION_FAILED"
    console.error("Cause:", error.cause);      // Original error from registry
  }
}
```

## Stage 2: Liveness Check

The second stage confirms the agent is reachable and responding. This prevents sending messages to offline or unresponsive agents.

### Two Modes of Liveness Checking

The pipeline supports two liveness checking modes:

#### Cached Mode (`requireLive`)

Uses the agent's cached `isLive` status from the registry. Fast but may be stale.

```typescript
const client = new AletheiaA2AClient({
  requireLive: true,  // Check cached isLive status (default: true)
});
```

When `requireLive: true`, the pipeline checks `agent.isLive` from the registry data. If `false`, throws `AgentNotLiveError` immediately.

#### Fresh Mode (`livenessCheckBeforeSend`)

Performs a real-time liveness probe before each message. More reliable but adds latency.

```typescript
const client = new AletheiaA2AClient({
  livenessCheckBeforeSend: true,  // Probe agent before each send
});
```

This calls `client.checkLiveness(agent.did)` to verify the agent responds to a liveness probe.

### Combining Both Modes

You can use both modes together for defense-in-depth:

```typescript
const client = new AletheiaA2AClient({
  requireLive: true,              // Fail fast on cached offline status
  livenessCheckBeforeSend: true,  // Double-check before sending
});
```

### Disabling Liveness Checks

For maximum flexibility (e.g., queue-based systems), disable both:

```typescript
const client = new AletheiaA2AClient({
  requireLive: false,
  livenessCheckBeforeSend: false,
});
```

### Error: AgentNotLiveError

When an agent fails the liveness check, the pipeline throws an `AgentNotLiveError`:

```typescript
import { AgentNotLiveError } from "@a2aletheia/a2a";

try {
  await client.sendByCapability("text-generation", "Hello!");
} catch (error) {
  if (error instanceof AgentNotLiveError) {
    console.error("Agent not live:", error.message);
    console.error("Error code:", error.code); // "AGENT_NOT_LIVE"
  }
}
```

## Stage 3: Trust Score Gate

The final stage ensures the agent meets a minimum trust score threshold. Trust scores are reputation metrics maintained by the registry.

### How Trust Scores Work

Trust scores range from 0-100 and reflect an agent's reputation:

| Score Range | Reputation Level |
|-------------|------------------|
| 0-29        | Untrusted        |
| 30-59       | Limited Trust    |
| 60-79       | Trusted          |
| 80-100      | Highly Trusted   |

Scores are calculated from factors like:

- Successful message deliveries
- Response quality ratings
- Uptime history
- Community verification

### Setting the Minimum Trust Score

Configure the threshold in your client:

```typescript
const client = new AletheiaA2AClient({
  minTrustScore: 60,  // Only interact with "Trusted" agents or higher
});
```

Set to `0` (default) to disable the trust score gate entirely:

```typescript
const client = new AletheiaA2AClient({
  minTrustScore: 0,  // No trust score filtering
});
```

### Error: TrustScoreBelowThresholdError

When an agent's trust score is below the threshold, the pipeline throws a `TrustScoreBelowThresholdError`:

```typescript
import { TrustScoreBelowThresholdError } from "@a2aletheia/a2a";

try {
  await client.sendByCapability("text-generation", "Hello!");
} catch (error) {
  if (error instanceof TrustScoreBelowThresholdError) {
    console.error("Trust score too low:", error.trustScore);
    console.error("Required threshold:", error.threshold);
    console.error("Error code:", error.code); // "TRUST_SCORE_BELOW_THRESHOLD"
  }
}
```

## TrustInfo Object

Every trusted operation returns a `TrustInfo` object containing the verification results:

```typescript
interface TrustInfo {
  didVerified: boolean;        // DID was successfully resolved
  isLive: boolean;             // Agent is currently live
  trustScore: number | null;   // Agent's trust score (0-100)
  isBattleTested: boolean;     // Agent passed stress testing
  responseVerified: boolean | null;  // Response signature verified (future)
  verifiedAt: Date;            // When verification was performed
}
```

### Accessing TrustInfo

```typescript
const response = await client.sendByCapability("text-generation", "Hello!");

console.log("Trust verification:", response.trustInfo);
// {
//   didVerified: true,
//   isLive: true,
//   trustScore: 85,
//   isBattleTested: true,
//   responseVerified: null,
//   verifiedAt: 2026-02-15T10:30:00.000Z
// }
```

### TrustInfo Properties

| Property | Type | Description |
|----------|------|-------------|
| `didVerified` | `boolean` | `true` if the agent's DID was successfully resolved in Stage 1 |
| `isLive` | `boolean` | `true` if the agent was confirmed live in Stage 2 |
| `trustScore` | `number \| null` | Agent's reputation score (0-100), or `null` if unknown |
| `isBattleTested` | `boolean` | `true` if the agent has passed stress testing and edge case validation |
| `responseVerified` | `boolean \| null` | Response cryptographic verification status (reserved for future phases) |
| `verifiedAt` | `Date` | Timestamp when the trust pipeline completed verification |

## Configuration Reference

All pipeline-related configuration options:

```typescript
interface AletheiaA2AConfig {
  // Stage 1: DID Resolution
  verifyIdentity?: boolean;  // Default: true
                             // Set false to skip DID verification

  // Stage 2: Liveness Check
  requireLive?: boolean;                // Default: true
                                         // Check cached isLive status
  livenessCheckBeforeSend?: boolean;    // Default: false
                                         // Probe agent before each send

  // Stage 3: Trust Score Gate
  minTrustScore?: number;   // Default: 0
                            // Minimum trust score (0-100)
}
```

### Default Configuration

```typescript
const defaults = {
  verifyIdentity: true,
  requireLive: true,
  livenessCheckBeforeSend: false,
  minTrustScore: 0,
};
```

### Configuration Examples

**High-security production environment:**

```typescript
const client = new AletheiaA2AClient({
  verifyIdentity: true,
  requireLive: true,
  livenessCheckBeforeSend: true,
  minTrustScore: 80,
});
```

**Development/testing environment:**

```typescript
const client = new AletheiaA2AClient({
  verifyIdentity: false,
  requireLive: false,
  livenessCheckBeforeSend: false,
  minTrustScore: 0,
});
```

**Async queue-based processing:**

```typescript
const client = new AletheiaA2AClient({
  verifyIdentity: true,
  requireLive: false,           // Agent may be offline when queued
  livenessCheckBeforeSend: false,
  minTrustScore: 50,
});
```

## When Trust Fails

Handle each error type appropriately in your application:

### DIDResolutionError

```typescript
import { DIDResolutionError } from "@a2aletheia/a2a";

try {
  await client.connect(agentDid);
} catch (error) {
  if (error instanceof DIDResolutionError) {
    // The agent's identity could not be verified
    // Possible causes:
    // - Invalid DID format
    // - DID not found in registry
    // - Registry unavailable
    // - Network connectivity issues
    
    if (error.cause?.message.includes("not found")) {
      console.error("Agent not registered:", agentDid);
    } else {
      console.error("Registry error, retry later");
    }
  }
}
```

### AgentNotLiveError

```typescript
import { AgentNotLiveError } from "@a2aletheia/a2a";

try {
  await client.sendByCapability("text-generation", message);
} catch (error) {
  if (error instanceof AgentNotLiveError) {
    // The agent is offline or unreachable
    // Options:
    // 1. Queue the message for retry
    // 2. Find an alternative agent
    // 3. Notify the user
    
    // Find alternative agent with same capability
    const alternatives = await client.findAgents({
      capability: "text-generation",
      requireLive: true,
    });
    
    if (alternatives.length > 0) {
      // Retry with alternative
      await client.sendToAgent(alternatives[0].did, message);
    } else {
      console.log("No live agents available, message queued");
    }
  }
}
```

### TrustScoreBelowThresholdError

```typescript
import { TrustScoreBelowThresholdError } from "@a2aletheia/a2a";

try {
  await client.sendByCapability("text-generation", message);
} catch (error) {
  if (error instanceof TrustScoreBelowThresholdError) {
    // The agent's reputation is below your threshold
    console.warn(`Agent score ${error.trustScore} < ${error.threshold}`);
    
    // Options:
    // 1. Lower threshold temporarily for less critical tasks
    // 2. Use a different agent
    // 3. Log and skip for non-essential operations
    
    const response = await client.sendByCapability("text-generation", message, {
      minTrustScore: error.trustScore ?? 0,  // Accept this agent
    });
  }
}
```

### Catching All Trust Errors

```typescript
import { AletheiaA2AError } from "@a2aletheia/a2a";

try {
  await client.sendByCapability("text-generation", message);
} catch (error) {
  if (error instanceof AletheiaA2AError) {
    console.error("Trust pipeline error:", error.code);
    console.error("Message:", error.message);
    
    // Handle by error code
    switch (error.code) {
      case "DID_RESOLUTION_FAILED":
        // Identity verification failed
        break;
      case "AGENT_NOT_LIVE":
        // Agent unreachable
        break;
      case "TRUST_SCORE_BELOW_THRESHOLD":
        // Reputation too low
        break;
    }
  }
}
```

## Trust Verification Timing

Understanding when trust verification occurs helps optimize performance.

### Connection Time

When you call `connect()`, the pipeline runs all stages:

```typescript
// Trust pipeline runs during connect
const agent = await client.connect("did:example:agent-123");
// - DID is resolved and verified
// - Agent isLive status is checked (if requireLive: true)
// - Trust score is validated (if minTrustScore > 0)
```

The agent object returned contains the verification results:

```typescript
console.log(agent.did);          // "did:example:agent-123"
console.log(agent.isLive);       // true/false
console.log(agent.trustScore);   // 0-100 or null
```

### Per-Message Verification

When using `livenessCheckBeforeSend: true`, Stage 2 runs before each message:

```typescript
const client = new AletheiaA2AClient({
  livenessCheckBeforeSend: true,  // Fresh liveness probe per message
});

// Liveness is probed before each send
await client.sendByCapability("text-generation", "Message 1");
await client.sendByCapability("text-generation", "Message 2");
```

This adds latency but ensures the agent is live at the moment of sending.

### Optimization Strategies

**Cache agent connections:**

```typescript
// Connect once, reuse for multiple sends
const agent = await client.connect("did:example:agent-123");

await client.sendToAgent(agent.did, "Message 1");
await client.sendToAgent(agent.did, "Message 2");
```

**Trust once, verify liveness per message:**

```typescript
const client = new AletheiaA2AClient({
  verifyIdentity: true,         // Verify DID on connect
  requireLive: true,            // Check cached status on connect
  livenessCheckBeforeSend: true, // Fresh probe before each send
  minTrustScore: 50,            // Validate trust on connect
});
```

**Relaxed trust for high-volume scenarios:**

```typescript
const client = new AletheiaA2AClient({
  verifyIdentity: true,
  requireLive: false,           // Skip cached check
  livenessCheckBeforeSend: false, // Skip fresh probe
  minTrustScore: 30,            // Lower threshold
});
```