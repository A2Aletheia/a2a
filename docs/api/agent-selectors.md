---
layout: default
title: Agent Selectors
nav_order: 4
parent: API Reference
nav_category: api
---

# Agent Selectors

Agent selectors determine which agent to use when multiple agents match discovery criteria. They implement a strategy pattern for flexible agent selection.

```typescript
import { AgentSelector, HighestTrustSelector, RandomSelector, FirstMatchSelector } from "@a2aletheia/a2a";
```

## AgentSelector Interface

The `AgentSelector` interface defines the contract for all selector implementations.

```typescript
interface AgentSelector {
  select(agents: Agent[]): Agent;
}
```

**Parameters:**
- `agents: Agent[]` - Array of discovered agents matching the query criteria

**Returns:**
- `Agent` - The selected agent

**Throws:**
- `AgentNotFoundError` - When the `agents` array is empty

**Purpose:** Selectors encapsulate the logic for choosing one agent from multiple candidates, enabling strategies like trust-based selection, random distribution, or deterministic ordering.

---

## HighestTrustSelector

The default selector that chooses the agent with the highest trust score, using liveness check timestamp as a tie-breaker.

### Constructor

```typescript
new HighestTrustSelector()
```

No parameters required.

### Selection Algorithm

1. Finds the agent with the highest `trustScore`
2. On tie, selects the agent with the most recent `lastLivenessCheck`
3. Agents with `trustScore: null` are treated as having score `-1`

### Example Usage

```typescript
import { HighestTrustSelector } from "@a2aletheia/a2a";

const selector = new HighestTrustSelector();
const agent = selector.select(discoveredAgents);
// Returns agent with highest trust, or most recently verified on tie
```

---

## RandomSelector

Selects a random agent from the discovered candidates, useful for load distribution.

### Constructor

```typescript
new RandomSelector()
```

No parameters required.

### Example Usage

```typescript
import { RandomSelector } from "@a2aletheia/a2a";

const selector = new RandomSelector();
const agent = selector.select(discoveredAgents);
// Returns a random agent from the array
```

---

## FirstMatchSelector

Returns the first agent in the array, respecting registry ordering.

### Constructor

```typescript
new FirstMatchSelector()
```

No parameters required.

### Example Usage

```typescript
import { FirstMatchSelector } from "@a2aletheia/a2a";

const selector = new FirstMatchSelector();
const agent = selector.select(discoveredAgents);
// Returns agents[0] - useful when registry ordering is meaningful
```

---

## Implementing Custom Selectors

Create custom selectors by implementing the `AgentSelector` interface.

### Interface Requirements

- Implement `select(agents: Agent[]): Agent` method
- Handle empty array case (throw `AgentNotFoundError`)
- Return exactly one agent from the input array

### Complete Example

```typescript
import { AgentSelector } from "@a2aletheia/a2a";
import type { Agent } from "@a2aletheia/sdk";
import { AgentNotFoundError } from "@a2aletheia/a2a/errors";

class BattleTestedSelector implements AgentSelector {
  select(agents: Agent[]): Agent {
    if (agents.length === 0) {
      throw new AgentNotFoundError("No agents match the given criteria");
    }

    // Prefer battle-tested agents, then by trust score
    const battleTested = agents.filter(a => a.isBattleTested);
    const pool = battleTested.length > 0 ? battleTested : agents;

    return pool.reduce((best, current) => {
      const bestScore = best.trustScore ?? -1;
      const currentScore = current.trustScore ?? -1;
      return currentScore > bestScore ? current : best;
    });
  }
}

// Usage
const selector = new BattleTestedSelector();
const agent = selector.select(discoveredAgents);
```

### Using Custom Selectors

Pass your selector to the AletheiaA2A configuration:

```typescript
import { AletheiaA2A } from "@a2aletheia/a2a";

const client = new AletheiaA2A({
  agentSelector: new BattleTestedSelector()
});
```