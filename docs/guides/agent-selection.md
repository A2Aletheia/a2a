---
layout: default
title: Agent Selection Strategies
nav_order: 3
parent: Guides
nav_category: guides
---

# Agent Selection Strategies

## Overview

When multiple agents in the registry share the same capability, AletheiaA2A needs a strategy to choose which one to use. The agent selection mechanism determines which agent from a pool of candidates will handle a given request.

Agent selection is invoked when using high-level methods like `sendByCapability()` or `streamByCapability()`. The discovery process first finds all matching agents, then the selector chooses one from that pool.

Selection matters because different agents may have:
- Different trust scores
- Different reliability characteristics
- Different response quality
- Different geographic locations or latency profiles
- Different specializations within the same capability

## Built-in Selectors

### HighestTrustSelector (Default)

The default selector chooses the agent with the highest `trustScore`. Trust scores reflect the agent's historical reliability, response quality, and verification status.

```typescript
import { HighestTrustSelector } from "@a2aletheia/a2a";

const selector = new HighestTrustSelector();
```

**Selection logic:**
1. Compare `trustScore` values (higher is better)
2. If scores are equal, prefer the agent with more recent `lastLivenessCheck`

This selector is ideal for production workloads where reliability and quality are paramount.

### RandomSelector

Randomly selects an agent from the discovered pool. Useful for load distribution when all candidates are equally trusted.

```typescript
import { RandomSelector } from "@a2aletheia/a2a";

const selector = new RandomSelector();
```

**Selection logic:**
1. Pick a random index from the agents array

### FirstMatchSelector

Returns the first agent from the discovery results. The ordering depends on the registry's internal ordering.

```typescript
import { FirstMatchSelector } from "@a2aletheia/a2a";

const selector = new FirstMatchSelector();
```

**Selection logic:**
1. Return `agents[0]`

## Using Selectors

Configure the selector in `AletheiaA2AConfig` when creating an `AletheiaA2A` instance:

```typescript
import { AletheiaA2A, RandomSelector } from "@a2aletheia/a2a";

const client = new AletheiaA2A({
  agentSelector: new RandomSelector(),
  minTrustScore: 0.7,
});
```

If no selector is specified, `HighestTrustSelector` is used by default:

```typescript
import { AletheiaA2A } from "@a2aletheia/a2a";

// Uses HighestTrustSelector by default
const client = new AletheiaA2A({
  minTrustScore: 0.7,
});
```

The selector is invoked internally by `sendByCapability()` and `streamByCapability()`:

```typescript
// Discovery finds matching agents, then selector picks one
const response = await client.sendByCapability(
  "code-generation",
  "Write a TypeScript function"
);
```

## The AgentSelector Interface

Custom selectors implement the `AgentSelector` interface:

```typescript
import type { Agent } from "@a2aletheia/sdk";

interface AgentSelector {
  select(agents: Agent[]): Agent;
}
```

The `select` method receives a non-empty array of `Agent` objects and must return exactly one agent. The agents array contains all agents that matched the discovery criteria.

Each `Agent` object contains:

```typescript
interface Agent {
  did: string;
  name: string;
  url: string;
  capabilities: string[];
  trustScore: number | null;
  isLive: boolean;
  lastLivenessCheck: Date | null;
  isBattleTested: boolean;
  // ... additional fields
}
```

## Creating a Custom Selector

### Example 1: Prefer Specific DIDs

Select a preferred agent if available, fall back to highest trust otherwise:

```typescript
import type { Agent } from "@a2aletheia/sdk";
import type { AgentSelector } from "@a2aletheia/a2a";

class PreferredAgentSelector implements AgentSelector {
  private preferredDids: Set<string>;

  constructor(preferredDids: string[]) {
    this.preferredDids = new Set(preferredDids);
  }

  select(agents: Agent[]): Agent {
    // First, check for preferred agents
    const preferred = agents.find(a => this.preferredDids.has(a.did));
    if (preferred) {
      return preferred;
    }

    // Fall back to highest trust score
    return agents.reduce((best, current) => {
      const bestScore = best.trustScore ?? -1;
      const currentScore = current.trustScore ?? -1;
      return currentScore > bestScore ? current : best;
    });
  }
}
```

Usage:

```typescript
const client = new AletheiaA2A({
  agentSelector: new PreferredAgentSelector([
    "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
    "did:key:z6MkjY9UirPbDcQz5Z5z5Z5z5Z5z5Z5z5Z5z5Z5z5Z5z5Z5z5",
  ]),
});
```

### Example 2: Round-Robin Load Balancing

Distribute requests evenly across all agents:

```typescript
import type { Agent } from "@a2aletheia/sdk";
import type { AgentSelector } from "@a2aletheia/a2a";

class RoundRobinSelector implements AgentSelector {
  private index = 0;

  select(agents: Agent[]): Agent {
    const selected = agents[this.index % agents.length];
    this.index++;
    return selected;
  }
}
```

Usage:

```typescript
const client = new AletheiaA2A({
  agentSelector: new RoundRobinSelector(),
});
```

### Example 3: Geographic Preference

Prefer agents closer to a specific region (assuming agents have location metadata):

```typescript
import type { Agent } from "@a2aletheia/sdk";
import type { AgentSelector } from "@a2aletheia/a2a";

interface AgentWithLocation extends Agent {
  metadata?: {
    region?: string;
  };
}

class GeographicSelector implements AgentSelector {
  private preferredRegions: string[];

  constructor(preferredRegions: string[]) {
    this.preferredRegions = preferredRegions;
  }

  select(agents: Agent[]): Agent {
    // Try to find an agent in preferred regions
    for (const region of this.preferredRegions) {
      const match = agents.find(a => 
        (a as AgentWithLocation).metadata?.region === region
      );
      if (match) return match;
    }

    // Fall back to first available
    return agents[0];
  }
}
```

Usage:

```typescript
const client = new AletheiaA2A({
  agentSelector: new GeographicSelector(["us-east", "us-west", "eu-west"]),
});
```

### Example 4: Composite Selector with Fallback

Chain multiple selection strategies:

```typescript
import type { Agent } from "@a2aletheia/sdk";
import type { AgentSelector } from "@a2aletheia/a2a";

class CompositeSelector implements AgentSelector {
  private strategies: AgentSelector[];

  constructor(strategies: AgentSelector[]) {
    this.strategies = strategies;
  }

  select(agents: Agent[]): Agent {
    if (this.strategies.length === 0) {
      return agents[0];
    }

    // Use first strategy as the primary selector
    return this.strategies[0].select(agents);
  }
}

// Or a more sophisticated fallback chain:
class FallbackSelector implements AgentSelector {
  private primary: AgentSelector;
  private fallback: AgentSelector;
  private predicate: (agents: Agent[]) => boolean;

  constructor(
    primary: AgentSelector,
    fallback: AgentSelector,
    predicate: (agents: Agent[]) => boolean
  ) {
    this.primary = primary;
    this.fallback = fallback;
    this.predicate = predicate;
  }

  select(agents: Agent[]): Agent {
    if (this.predicate(agents)) {
      return this.primary.select(agents);
    }
    return this.fallback.select(agents);
  }
}
```

## Discovery Parameters

The `discover()` method parameters control the pool of agents passed to the selector:

```typescript
const agents = await client.discover({
  capability: "text-generation",  // Filter by capability
  query: "creative writing",       // Text search on name/description
  isLive: true,                    // Only return live agents
  minTrustScore: 0.8,              // Minimum trust threshold
  limit: 10,                       // Maximum results
});
```

| Parameter | Description | Effect on Selection Pool |
|-----------|-------------|--------------------------|
| `capability` | Required capability string | Narrows to agents with this capability |
| `query` | Search query | Narrows to matching names/descriptions |
| `isLive` | Filter by liveness status | Excludes offline agents |
| `minTrustScore` | Minimum trust threshold | Excludes low-trust agents |
| `limit` | Maximum results | Caps pool size (may exclude viable agents) |

Discovery defaults from config:

```typescript
const client = new AletheiaA2A({
  requireLive: true,      // Default isLive=true for discover()
  minTrustScore: 0.5,     // Default minTrustScore for discover()
});
```

When using `sendByCapability()`, discovery uses these defaults and the selector chooses from the resulting pool:

```typescript
// Uses config defaults for isLive and minTrustScore
const response = await client.sendByCapability(
  "translation",
  "Translate to French"
);
```

## Best Practices

### When to Use HighestTrustSelector (Default)

- **Production workloads** where reliability is critical
- **High-stakes operations** requiring trusted responses
- **Default choice** when no specific selection criteria exist

```typescript
const client = new AletheiaA2A(); // HighestTrustSelector by default
```

### When to Use RandomSelector

- **Load distribution** across equally-trusted agents
- **Testing and experimentation** with different agents
- **Chaos engineering** to verify resilience

```typescript
const client = new AletheiaA2A({
  agentSelector: new RandomSelector(),
});
```

### When to Use FirstMatchSelector

- **Predictable behavior** when registry ordering is intentional
- **Simple use cases** where selection order doesn't matter
- **Debugging** to consistently use the same agent

```typescript
const client = new AletheiaA2A({
  agentSelector: new FirstMatchSelector(),
});
```

### When to Create a Custom Selector

- **Specific agent preferences** (preferred partners, approved vendors)
- **Load balancing requirements** (round-robin, weighted distribution)
- **Geographic or latency optimization** (region-aware selection)
- **Business rules** (cost optimization, SLA tiers)
- **Multi-tenant scenarios** (different agents per customer)

### Discovery Optimization

Combine discovery parameters with appropriate selectors:

```typescript
// For high-trust, live-only scenarios
const client = new AletheiaA2A({
  requireLive: true,
  minTrustScore: 0.9,
  // HighestTrustSelector default ensures best of the best
});

// For broader pools with custom selection
const client = new AletheiaA2A({
  agentSelector: new GeographicSelector(["eu-west"]),
  // Don't set minTrustScore too high - let selector decide
});
```

### Connection Caching

AletheiaA2A caches connections by DID. With selectors like `RandomSelector`, you may want to clear connections to force re-selection:

```typescript
const client = new AletheiaA2A({
  agentSelector: new RandomSelector(),
});

// First request - random selection
await client.sendByCapability("chat", "Hello");

// Clear cache to force new random selection
client.clearConnections();

// Second request - potentially different agent
await client.sendByCapability("chat", "Hello again");
```