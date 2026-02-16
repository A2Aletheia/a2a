---
layout: default
title: Errors
nav_order: 6
parent: API Reference
nav_category: api
---

# Errors

All errors in the Aletheia A2A SDK extend from a common base class, providing consistent error handling patterns across the codebase.

## Import

```typescript
import {
  AletheiaA2AError,
  AgentNotFoundError,
  DIDResolutionError,
  AgentNotLiveError,
  TrustScoreBelowThresholdError,
  A2AProtocolError,
} from "@aletheia/a2a";
```

---

## AletheiaA2AError

The base error class for all Aletheia A2A errors. All other error types in this module extend from this class.

### Constructor

```typescript
constructor(message: string, code: string, options?: { cause?: Error })
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `string` | Human-readable error message |
| `code` | `string` | Machine-readable error code |
| `options` | `{ cause?: Error }` | Optional error options, including the underlying cause |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | The error name (e.g., `"AletheiaA2AError"`) |
| `message` | `string` | Human-readable error message |
| `code` | `string` | Machine-readable error code for programmatic handling |
| `cause` | `Error \| undefined` | The underlying error that caused this error |

### Example

```typescript
try {
  // ... SDK operation
} catch (error) {
  if (error instanceof AletheiaA2AError) {
    console.error(`Error [${error.code}]: ${error.message}`);
    if (error.cause) {
      console.error("Caused by:", error.cause);
    }
  }
}
```

---

## AgentNotFoundError

Thrown when no agents match the requested capability or search criteria.

- **Code:** `AGENT_NOT_FOUND`

### Constructor

```typescript
constructor(message: string, options?: { cause?: Error })
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `string` | Description of why no agent was found |
| `options` | `{ cause?: Error }` | Optional error options |

### Example

```typescript
import { AgentNotFoundError } from "@aletheia/a2a";

try {
  const agent = await client.findAgent({ capability: "nonexistent-capability" });
} catch (error) {
  if (error instanceof AgentNotFoundError) {
    console.error(`No agent found: ${error.message}`);
    // Handle missing agent scenario
  }
}
```

---

## DIDResolutionError

Thrown when DID (Decentralized Identifier) resolution fails.

- **Code:** `DID_RESOLUTION_FAILED`

### Constructor

```typescript
constructor(message: string, options?: { cause?: Error })
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `string` | Description of the DID resolution failure |
| `options` | `{ cause?: Error }` | Optional error options |

### Example

```typescript
import { DIDResolutionError } from "@aletheia/a2a";

try {
  const didDocument = await client.resolveDID("did:example:invalid");
} catch (error) {
  if (error instanceof DIDResolutionError) {
    console.error(`DID resolution failed: ${error.message}`);
    if (error.cause) {
      console.error("Underlying cause:", error.cause.message);
    }
  }
}
```

---

## AgentNotLiveError

Thrown when an agent is unreachable or not responding.

- **Code:** `AGENT_NOT_LIVE`

### Constructor

```typescript
constructor(message: string, options?: { cause?: Error })
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `string` | Description of why the agent is unreachable |
| `options` | `{ cause?: Error }` | Optional error options |

### Example

```typescript
import { AgentNotLiveError } from "@aletheia/a2a";

try {
  await client.sendMessage(agentDID, message);
} catch (error) {
  if (error instanceof AgentNotLiveError) {
    console.error(`Agent is not responding: ${error.message}`);
    // Implement retry logic or failover
  }
}
```

---

## TrustScoreBelowThresholdError

Thrown when an agent's trust score is below the required threshold for an operation.

- **Code:** `TRUST_SCORE_BELOW_THRESHOLD`

### Constructor

```typescript
constructor(
  trustScore: number | null,
  threshold: number,
  options?: { cause?: Error }
)
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `trustScore` | `number \| null` | The agent's trust score, or `null` if unknown |
| `threshold` | `number` | The minimum required trust score |
| `options` | `{ cause?: Error }` | Optional error options |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `trustScore` | `number \| null` | The agent's trust score, or `null` if unknown |
| `threshold` | `number` | The minimum required trust score |

### Example

```typescript
import { TrustScoreBelowThresholdError } from "@aletheia/a2a";

try {
  await client.executeAction(agentDID, action);
} catch (error) {
  if (error instanceof TrustScoreBelowThresholdError) {
    console.error(`Trust score too low: ${error.trustScore} (required: ${error.threshold})`);
    // Implement trust verification or user consent flow
    if (error.trustScore === null) {
      console.warn("Agent trust score is unknown");
    }
  }
}
```

---

## A2AProtocolError

Thrown when a JSON-RPC error is received from the A2A protocol layer.

- **Code:** `A2A_PROTOCOL_ERROR`

### Constructor

```typescript
constructor(
  message: string,
  options?: { cause?: Error; rpcCode?: number }
)
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `string` | Description of the protocol error |
| `options` | `{ cause?: Error; rpcCode?: number }` | Optional error options with RPC error code |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `rpcCode` | `number \| undefined` | The JSON-RPC error code, if available |

### Example

```typescript
import { A2AProtocolError } from "@aletheia/a2a";

try {
  await client.invokeMethod(agentDID, method, params);
} catch (error) {
  if (error instanceof A2AProtocolError) {
    console.error(`Protocol error: ${error.message}`);
    if (error.rpcCode !== undefined) {
      console.error(`JSON-RPC error code: ${error.rpcCode}`);
      // Handle specific RPC error codes
      // -32700: Parse error
      // -32600: Invalid request
      // -32601: Method not found
      // -32602: Invalid params
      // -32603: Internal error
    }
  }
}
```

---

## Error Handling Best Practices

### Catching Specific Errors

Use `instanceof` checks to handle specific error types:

```typescript
import {
  AletheiaA2AError,
  AgentNotFoundError,
  AgentNotLiveError,
  TrustScoreBelowThresholdError,
} from "@aletheia/a2a";

try {
  await client.performOperation();
} catch (error) {
  if (error instanceof AgentNotFoundError) {
    // Handle missing agent
  } else if (error instanceof AgentNotLiveError) {
    // Handle unreachable agent
  } else if (error instanceof TrustScoreBelowThresholdError) {
    // Handle trust score issues
  } else if (error instanceof AletheiaA2AError) {
    // Handle any other Aletheia A2A error
  } else {
    // Handle unexpected errors
    throw error;
  }
}
```

### Accessing Error Codes

All errors have a `code` property for programmatic error handling:

```typescript
switch (error.code) {
  case "AGENT_NOT_FOUND":
    // Handle missing agent
    break;
  case "AGENT_NOT_LIVE":
    // Handle unreachable agent
    break;
  case "TRUST_SCORE_BELOW_THRESHOLD":
    // Handle trust score issues
    break;
  case "DID_RESOLUTION_FAILED":
    // Handle DID resolution failure
    break;
  case "A2A_PROTOCOL_ERROR":
    // Handle protocol error
    break;
}
```

### Error Chaining

Access the underlying cause using the `cause` property:

```typescript
if (error.cause) {
  console.error("Original error:", error.cause);
}
```
