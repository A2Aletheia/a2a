---
layout: default
title: Flow Types
nav_order: 8
parent: API Reference
nav_category: api
---

# Flow Types

Flow types enable orchestrator-agent communication for user interactions like delegation, payment, and confirmation. A **flow** is a request from an agent to the orchestrator to execute a user interaction before continuing the conversation.

## Import

```typescript
import {
  ORCHESTRATOR_PROTOCOL_URN,
  FLOW_REQUEST_EXTENSION,
  requestDelegation,
  requestPayment,
  requestConfirmation,
  isFlowRequest,
  extractFlowRequest,
  isDelegationFlow,
  isPaymentFlow,
  isConfirmationFlow,
} from "@a2aletheia/a2a";

import type {
  FlowType,
  FlowRequest,
  SkillAuthorization,
} from "@a2aletheia/a2a";
```

---

## Constants

### ORCHESTRATOR_PROTOCOL_URN

```typescript
const ORCHESTRATOR_PROTOCOL_URN = "urn:a2a:orchestrator:v1" as const;
```

The well-known URN for the orchestrator protocol. Used in AgentCard extensions to advertise orchestrator capabilities.

---

### FLOW_REQUEST_EXTENSION

```typescript
const FLOW_REQUEST_EXTENSION = "urn:a2a:flow-request:v1" as const;
```

The metadata key for flow requests. When an agent yields control to request a flow, the response includes this key in its metadata.

---

## Flow Request Factories

### requestDelegation()

Create a delegation flow request. Used when the agent needs user authorization to proceed.

```typescript
function requestDelegation(params: {
  scope: string;
  delegateDid: string;
  reason?: string;
}): FlowRequest
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scope` | `string` | Yes | Authorization scope (e.g., `"payment"`, `"booking"`) |
| `delegateDid` | `string` | Yes | The agent's DID requesting delegation |
| `reason` | `string` | No | Human-readable reason for the request |

**Returns:** `FlowRequest`

**Example:**

```typescript
import { requestDelegation, getVerifiedUser } from "@a2aletheia/a2a";

peer.handle(async (context, response) => {
  const user = getVerifiedUser(context);
  
  if (needsAuth && !user?.valid) {
    response.flow(requestDelegation({
      scope: "payment",
      delegateDid: context.agentDid,
      reason: "Payment requires authorization",
    }));
    return;
  }
  
  // Proceed with authorized action
  await processPayment(user.address);
  response.text("Payment processed successfully");
});
```

---

### requestPayment()

Create a payment flow request. Used when the agent needs payment before proceeding.

```typescript
function requestPayment(params: {
  amount: string;
  currency: string;
  recipient: string;
  reason?: string;
}): FlowRequest
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `amount` | `string` | Yes | Payment amount (as string for precision) |
| `currency` | `string` | Yes | Currency code (e.g., `"USDC"`, `"ETH"`) |
| `recipient` | `string` | Yes | Payment recipient address |
| `reason` | `string` | No | Human-readable reason for the payment |

**Returns:** `FlowRequest`

**Example:**

```typescript
response.flow(requestPayment({
  amount: "10.00",
  currency: "USDC",
  recipient: "0x1234...",
  reason: "Premium feature unlock",
}));
```

---

### requestConfirmation()

Create a confirmation flow request. Used when the agent needs explicit user confirmation.

```typescript
function requestConfirmation(params: {
  message: string;
  options?: string[];
}): FlowRequest
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message` | `string` | Yes | Confirmation message to display |
| `options` | `string[]` | No | Optional button labels (default: `["Confirm", "Cancel"]`) |

**Returns:** `FlowRequest`

**Example:**

```typescript
response.flow(requestConfirmation({
  message: "This will delete all your data. Continue?",
  options: ["Delete Everything", "Keep My Data"],
}));
```

---

## Type Guards

### isFlowRequest()

Type guard to check if a value is a valid `FlowRequest`.

```typescript
function isFlowRequest(data: unknown): data is FlowRequest
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `unknown` | Value to check |

**Returns:** `boolean`

**Example:**

```typescript
import { isFlowRequest } from "@a2aletheia/a2a";

const metadata = response.metadata;
if (isFlowRequest(metadata?.["urn:a2a:flow-request:v1"])) {
  console.log("Agent requested a flow:", metadata["urn:a2a:flow-request:v1"]);
}
```

---

### extractFlowRequest()

Extract a `FlowRequest` from message metadata, if present.

```typescript
function extractFlowRequest(
  metadata?: Record<string, unknown> | null
): FlowRequest | null
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `metadata` | `Record<string, unknown> \| null` | Message metadata to extract from |

**Returns:** `FlowRequest | null`

**Example:**

```typescript
import { extractFlowRequest, isDelegationFlow } from "@a2aletheia/a2a";

const flow = extractFlowRequest(response.metadata);
if (flow) {
  if (isDelegationFlow(flow)) {
    console.log("Delegation scope:", flow.payload.scope);
  }
}
```

---

### isDelegationFlow()

Check if a flow request is for delegation.

```typescript
function isDelegationFlow(flow: FlowRequest): boolean
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `flow` | `FlowRequest` | Flow request to check |

**Returns:** `boolean` - `true` if `flow.type === "urn:a2a:flow:delegation"`

---

### isPaymentFlow()

Check if a flow request is for payment.

```typescript
function isPaymentFlow(flow: FlowRequest): boolean
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `flow` | `FlowRequest` | Flow request to check |

**Returns:** `boolean` - `true` if `flow.type === "urn:a2a:flow:payment"`

---

### isConfirmationFlow()

Check if a flow request is for confirmation.

```typescript
function isConfirmationFlow(flow: FlowRequest): boolean
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `flow` | `FlowRequest` | Flow request to check |

**Returns:** `boolean` - `true` if `flow.type === "urn:a2a:flow:confirmation"`

---

## Types

### FlowType

Union type of all supported flow types.

```typescript
type FlowType = "delegation" | "payment" | "confirmation";
```

---

### FlowRequest

A flow request object included in response metadata when an agent yields control.

```typescript
interface FlowRequest {
  type: "urn:a2a:flow:delegation" | "urn:a2a:flow:payment" | "urn:a2a:flow:confirmation";
  payload: Record<string, unknown>;
  message: string;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `type` | `string` | Flow type URN |
| `payload` | `Record<string, unknown>` | Flow-specific parameters |
| `message` | `string` | Human-readable message for the user |

---

### SkillAuthorization

Configuration for skill-level authorization requirements.

```typescript
interface SkillAuthorization {
  requireUserDelegation: boolean;
  scope?: string;
  reason?: string;
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `requireUserDelegation` | `boolean` | Yes | Whether this skill requires user delegation |
| `scope` | `string` | No | Authorization scope |
| `reason` | `string` | No | Reason shown to the user |

---

## TrustedResponse Flow Handling

When an agent returns a flow request, it's available on the `TrustedResponse`:

```typescript
const response = await agent.send("Book a flight to Paris");

if (response.flowRequest) {
  if (isDelegationFlow(response.flowRequest)) {
    // Handle delegation flow
    console.log("Agent needs authorization:", response.flowRequest.message);
  } else if (isPaymentFlow(response.flowRequest)) {
    // Handle payment flow
    console.log("Payment required:", response.flowRequest.payload);
  }
}
```
