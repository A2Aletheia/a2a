---
layout: default
title: Orchestrator Protocol
nav_order: 9
parent: API Reference
nav_category: api
---

# Orchestrator Protocol

Types for advertising orchestrator capabilities in AgentCard extensions. An orchestrator (like Aria) advertises what flows it supports so agents know what they can request.

## Import

```typescript
import { ORCHESTRATOR_PROTOCOL_URN } from "@a2aletheia/a2a";
import type {
  OrchestratorProtocol,
  OrchestratorExtension,
} from "@a2aletheia/a2a";
```

---

## Constants

### ORCHESTRATOR_PROTOCOL_URN

```typescript
const ORCHESTRATOR_PROTOCOL_URN = "urn:a2a:orchestrator:v1" as const;
```

The well-known URN for the orchestrator protocol extension. Used as the key in `AgentCard.capabilities.extensions`.

---

## Types

### OrchestratorProtocol

Protocol definition that an orchestrator advertises in its AgentCard.

```typescript
interface OrchestratorProtocol {
  version: "1.0";
  flows: FlowType[];
}
```

| Property | Type | Description |
|----------|------|-------------|
| `version` | `"1.0"` | Protocol version |
| `flows` | `FlowType[]` | Array of supported flow types (`"delegation"`, `"payment"`, `"confirmation"`) |

---

### OrchestratorExtension

Extension structure for `AgentCard.capabilities.extensions`.

```typescript
interface OrchestratorExtension {
  [ORCHESTRATOR_PROTOCOL_URN]: OrchestratorProtocol;
}
```

---

## Usage

### Orchestrator AgentCard

When an orchestrator publishes its AgentCard, it includes the orchestrator protocol extension:

```typescript
import { ORCHESTRATOR_PROTOCOL_URN } from "@a2aletheia/a2a";
import type { AgentCard } from "@a2a-js/sdk";

const orchestratorCard: AgentCard = {
  name: "Aria",
  description: "Aletheia Orchestrator Agent",
  url: "https://aria.aletheia.dev",
  version: "1.0.0",
  capabilities: {
    streaming: true,
    pushNotifications: false,
    extensions: {
      [ORCHESTRATOR_PROTOCOL_URN]: {
        version: "1.0",
        flows: ["delegation", "payment", "confirmation"],
      },
    },
  },
  skills: [
    // ... orchestrator skills
  ],
};
```

### Agent Checks for Orchestrator Support

Agents can check what flows an orchestrator supports:

```typescript
import { ORCHESTRATOR_PROTOCOL_URN } from "@a2aletheia/a2a";

function getSupportedFlows(card: AgentCard): FlowType[] {
  const ext = card.capabilities?.extensions?.[ORCHESTRATOR_PROTOCOL_URN];
  return ext?.flows ?? [];
}

// Before requesting payment, check if orchestrator supports it
const flows = getSupportedFlows(orchestratorCard);
if (flows.includes("payment")) {
  response.flow(requestPayment({ ... }));
} else {
  response.text("Payment not supported by this orchestrator");
}
```

---

## Flow Types

The `FlowType` values that can appear in `OrchestratorProtocol.flows`:

| Flow Type | Description |
|-----------|-------------|
| `"delegation"` | User authorization flow via wallet signature |
| `"payment"` | Payment request flow |
| `"confirmation"` | Simple confirmation dialog |

See [Flow Types](flow-types) for details on creating flow requests.
