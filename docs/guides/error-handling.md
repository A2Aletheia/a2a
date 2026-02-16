---
layout: default
title: Error Handling
nav_order: 5
parent: Guides
nav_category: guides
---

# Error Handling

The `@a2aletheia/a2a` SDK provides a structured error hierarchy for consistent and type-safe error handling across all operations.

## Overview

All SDK errors extend `AletheiaA2AError`, a base class that provides:

- **`code`** - A string error code for programmatic handling
- **`name`** - The error class name
- **`message`** - A human-readable error description
- **`cause`** - Optional underlying error (via Error cause chain)

```typescript
import { AletheiaA2AError } from '@a2aletheia/a2a';

try {
  await client.sendByCapability('translation', 'Hello');
} catch (error) {
  if (error instanceof AletheiaA2AError) {
    console.error(`Error code: ${error.code}`);
    console.error(`Message: ${error.message}`);
  }
}
```

## Error Hierarchy

```
AletheiaA2AError (base class)
├── AgentNotFoundError
├── DIDResolutionError
├── AgentNotLiveError
├── TrustScoreBelowThresholdError
└── A2AProtocolError
```

## Error Reference Table

| Error Class | Code | When Thrown |
|------------|------|-------------|
| `AgentNotFoundError` | `AGENT_NOT_FOUND` | No agents match discovery criteria |
| `DIDResolutionError` | `DID_RESOLUTION_FAILED` | DID cannot be resolved or verified |
| `AgentNotLiveError` | `AGENT_NOT_LIVE` | Agent fails liveness check |
| `TrustScoreBelowThresholdError` | `TRUST_SCORE_BELOW_THRESHOLD` | Agent trust score below minimum |
| `A2AProtocolError` | `A2A_PROTOCOL_ERROR` | JSON-RPC protocol error from remote agent |

### AgentNotFoundError

**Code:** `AGENT_NOT_FOUND`

Thrown when agent discovery returns no matching agents.

```typescript
import { AgentNotFoundError } from '@a2aletheia/a2a';

try {
  await client.sendByCapability('nonexistent-capability', 'input');
} catch (error) {
  if (error instanceof AgentNotFoundError) {
    console.error('No agents available for this capability');
    // Consider: fallback capability, notify user, or retry with broader search
  }
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `code` | `string` | `"AGENT_NOT_FOUND"` |
| `name` | `string` | `"AgentNotFoundError"` |
| `message` | `string` | Descriptive message with capability |
| `cause` | `Error \| undefined` | Original error if wrapped |

### DIDResolutionError

**Code:** `DID_RESOLUTION_FAILED`

Thrown when DID verification is enabled and the agent's DID cannot be resolved.

```typescript
import { DIDResolutionError } from '@a2aletheia/a2a';

try {
  await client.connect('did:example:unreachable');
} catch (error) {
  if (error instanceof DIDResolutionError) {
    console.error('Could not verify agent identity');
    console.error('DID:', error.message);
    // Consider: skip verification, try alternative agent, or notify user
  }
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `code` | `string` | `"DID_RESOLUTION_FAILED"` |
| `name` | `string` | `"DIDResolutionError"` |
| `message` | `string` | Includes the DID that failed |
| `cause` | `Error \| undefined` | Original resolution error |

### AgentNotLiveError

**Code:** `AGENT_NOT_LIVE`

Thrown when liveness verification fails or the agent is known to be offline.

```typescript
import { AgentNotLiveError } from '@a2aletheia/a2a';

try {
  await client.sendByCapability('analysis', data);
} catch (error) {
  if (error instanceof AgentNotLiveError) {
    console.error('Agent is not responding');
    // Consider: retry with delay, select alternative agent, or queue for later
  }
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `code` | `string` | `"AGENT_NOT_LIVE"` |
| `name` | `string` | `"AgentNotLiveError"` |
| `message` | `string` | Includes agent DID or URL |
| `cause` | `Error \| undefined` | Original liveness check error |

### TrustScoreBelowThresholdError

**Code:** `TRUST_SCORE_BELOW_THRESHOLD`

Thrown when an agent's trust score is below the configured minimum threshold.

```typescript
import { TrustScoreBelowThresholdError } from '@a2aletheia/a2a';

try {
  await client.sendByCapability('sensitive-operation', data);
} catch (error) {
  if (error instanceof TrustScoreBelowThresholdError) {
    console.error(`Trust score ${error.trustScore} below threshold ${error.threshold}`);
    // Consider: lower threshold, find higher-trust agent, or require user approval
  }
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `code` | `string` | `"TRUST_SCORE_BELOW_THRESHOLD"` |
| `name` | `string` | `"TrustScoreBelowThresholdError"` |
| `trustScore` | `number \| null` | Agent's actual trust score (or null if unknown) |
| `threshold` | `number` | Required minimum trust score |
| `message` | `string` | Auto-generated with scores |
| `cause` | `Error \| undefined` | Original error if wrapped |

### A2AProtocolError

**Code:** `A2A_PROTOCOL_ERROR`

Thrown when a remote agent returns a JSON-RPC protocol error.

```typescript
import { A2AProtocolError } from '@a2aletheia/a2a';

try {
  await trustedAgent.send({ task: 'process', input: data });
} catch (error) {
  if (error instanceof A2AProtocolError) {
    console.error('Protocol error from remote agent');
    if (error.rpcCode !== undefined) {
      console.error(`JSON-RPC error code: ${error.rpcCode}`);
      // Standard JSON-RPC codes: -32700 (parse error), -32600 (invalid request), etc.
    }
  }
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `code` | `string` | `"A2A_PROTOCOL_ERROR"` |
| `name` | `string` | `"A2AProtocolError"` |
| `rpcCode` | `number \| undefined` | JSON-RPC error code from remote agent |
| `message` | `string` | Protocol error details |
| `cause` | `Error \| undefined` | Original protocol error |

## Handling Patterns

### instanceof Checks

Use `instanceof` for type-safe error handling:

```typescript
import {
  AletheiaA2AError,
  AgentNotFoundError,
  DIDResolutionError,
  AgentNotLiveError,
  TrustScoreBelowThresholdError,
  A2AProtocolError,
} from '@a2aletheia/a2a';

async function handleSend(capability: string, input: string) {
  try {
    return await client.sendByCapability(capability, input);
  } catch (error) {
    if (error instanceof AgentNotFoundError) {
      return { error: 'no_agents', message: error.message };
    }
    if (error instanceof DIDResolutionError) {
      return { error: 'identity_failed', message: error.message };
    }
    if (error instanceof AgentNotLiveError) {
      return { error: 'agent_offline', message: error.message };
    }
    if (error instanceof TrustScoreBelowThresholdError) {
      return { 
        error: 'low_trust', 
        score: error.trustScore, 
        threshold: error.threshold 
      };
    }
    if (error instanceof A2AProtocolError) {
      return { error: 'protocol_error', rpcCode: error.rpcCode };
    }
    if (error instanceof AletheiaA2AError) {
      return { error: error.code, message: error.message };
    }
    throw error; // Re-throw unknown errors
  }
}
```

### Error Code Switch

For broader handling without specific type checks:

```typescript
import { AletheiaA2AError } from '@a2aletheia/a2a';

function getErrorAction(error: AletheiaA2AError): 'retry' | 'abort' | 'fallback' {
  switch (error.code) {
    case 'AGENT_NOT_FOUND':
      return 'fallback';
    case 'AGENT_NOT_LIVE':
      return 'retry';
    case 'DID_RESOLUTION_FAILED':
      return 'abort';
    case 'TRUST_SCORE_BELOW_THRESHOLD':
      return 'abort';
    case 'A2A_PROTOCOL_ERROR':
      return 'retry';
    default:
      return 'abort';
  }
}
```

## Recovery Strategies

### Retry Strategy

Best for transient failures:

```typescript
import { AgentNotLiveError, A2AProtocolError, AletheiaA2AError } from '@a2aletheia/a2a';

async function sendWithRetry(
  capability: string, 
  input: string, 
  maxRetries = 3,
  delayMs = 1000
): Promise<TrustedResponse> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.sendByCapability(capability, input);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (error instanceof AgentNotLiveError || error instanceof A2AProtocolError) {
        console.warn(`Attempt ${attempt + 1} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  
  throw lastError;
}
```

### Fallback Strategy

Best when alternative agents or capabilities exist:

```typescript
import { AgentNotFoundError, TrustScoreBelowThresholdError } from '@a2aletheia/a2a';

async function sendWithFallback(
  capabilities: string[],
  input: string
): Promise<TrustedResponse | null> {
  for (const capability of capabilities) {
    try {
      return await client.sendByCapability(capability, input);
    } catch (error) {
      if (error instanceof AgentNotFoundError) {
        console.warn(`No agents for ${capability}, trying next...`);
        continue;
      }
      if (error instanceof TrustScoreBelowThresholdError) {
        console.warn(`Trust too low for ${capability}, trying next...`);
        continue;
      }
      throw error;
    }
  }
  return null;
}

// Usage
const result = await sendWithFallback(
  ['premium-translation', 'standard-translation', 'basic-translation'],
  'Translate this text'
);
```

### Graceful Degradation

Reduce requirements when errors occur:

```typescript
import { 
  AletheiaA2A, 
  TrustScoreBelowThresholdError,
  AgentNotLiveError 
} from '@a2aletheia/a2a';

async function sendWithDegradation(capability: string, input: string) {
  // Try with full trust requirements
  const strictClient = new AletheiaA2A({
    minTrustScore: 0.8,
    requireLive: true,
    livenessCheckBeforeSend: true
  });
  
  try {
    return await strictClient.sendByCapability(capability, input);
  } catch (error) {
    if (error instanceof TrustScoreBelowThresholdError) {
      // Fall back to lower trust threshold
      const relaxedClient = new AletheiaA2A({
        minTrustScore: 0.5,
        requireLive: true
      });
      return relaxedClient.sendByCapability(capability, input);
    }
    if (error instanceof AgentNotLiveError) {
      // Try without liveness check (use cached status)
      const cachedClient = new AletheiaA2A({
        minTrustScore: 0.8,
        requireLive: false
      });
      return cachedClient.sendByCapability(capability, input);
    }
    throw error;
  }
}
```

## Error Properties

### Base Class Properties

All error classes inherit these from `AletheiaA2AError`:

| Property | Type | Inherited | Description |
|----------|------|-----------|-------------|
| `code` | `string` | Yes | Unique error identifier |
| `name` | `string` | Yes | Class name |
| `message` | `string` | Yes | Human-readable description |
| `cause` | `Error \| undefined` | Yes | Wrapped original error |
| `stack` | `string` | Yes (from Error) | Stack trace |

### Class-Specific Properties

| Error Class | Additional Properties |
|-------------|----------------------|
| `TrustScoreBelowThresholdError` | `trustScore: number \| null`, `threshold: number` |
| `A2AProtocolError` | `rpcCode: number \| undefined` |

## Common Scenarios

### Discovery with Error Handling

```typescript
import { AletheiaA2A, AgentNotFoundError } from '@a2aletheia/a2a';

const client = new AletheiaA2A({ minTrustScore: 0.7 });

async function discoverOrThrow(capability: string) {
  try {
    const agents = await client.discover({ capability });
    if (agents.length === 0) {
      throw new Error(`No agents discovered for ${capability}`);
    }
    return agents;
  } catch (error) {
    if (error instanceof AgentNotFoundError) {
      console.error('Discovery returned no results');
      // Log to monitoring system
      logToMonitoring('agent_discovery_failed', { capability });
    }
    throw error;
  }
}
```

### Streaming with Error Handling

```typescript
import { AletheiaA2A, A2AProtocolError } from '@a2aletheia/a2a';

async function* safeStream(capability: string, input: string) {
  const client = new AletheiaA2A();
  
  try {
    for await (const event of client.streamByCapability(capability, input)) {
      yield event;
    }
  } catch (error) {
    if (error instanceof A2AProtocolError) {
      console.error(`Stream failed with RPC code: ${error.rpcCode}`);
      yield { type: 'error', message: error.message, recoverable: true };
      return;
    }
    yield { type: 'error', message: 'Unknown error', recoverable: false };
  }
}
```

### Connection with Verification

```typescript
import { AletheiaA2A, DIDResolutionError, AgentNotLiveError } from '@a2aletheia/a2a';

async function verifiedConnect(did: string) {
  const client = new AletheiaA2A({
    verifyIdentity: true,
    livenessCheckBeforeSend: true
  });
  
  try {
    const agent = await client.connect(did);
    console.log('Connected with verified identity');
    return agent;
  } catch (error) {
    if (error instanceof DIDResolutionError) {
      throw new Error(`Cannot verify agent identity: ${did}`);
    }
    if (error instanceof AgentNotLiveError) {
      // Try without liveness verification
      const fallbackClient = new AletheiaA2A({
        verifyIdentity: true,
        livenessCheckBeforeSend: false
      });
      return fallbackClient.connect(did);
    }
    throw error;
  }
}
```

## Best Practices

### Logging

Always log errors with context:

```typescript
import { AletheiaA2AError } from '@a2aletheia/a2a';

function logError(error: unknown, context: Record<string, unknown>) {
  if (error instanceof AletheiaA2AError) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      errorCode: error.code,
      errorName: error.name,
      message: error.message,
      cause: error.cause?.message,
      ...context
    }));
  } else if (error instanceof Error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      errorName: error.name,
      message: error.message,
      stack: error.stack,
      ...context
    }));
  }
}
```

### Error Wrapping

Preserve error context when re-throwing:

```typescript
import { AletheiaA2AError, AgentNotFoundError } from '@a2aletheia/a2a';

async function findAgent(capability: string) {
  try {
    return await client.discover({ capability });
  } catch (error) {
    if (error instanceof AgentNotFoundError) {
      // Wrap with additional context
      throw new AgentNotFoundError(
        `No ${capability} agents in region X`,
        { cause: error }
      );
    }
    throw error;
  }
}
```

### Type Guards

Create reusable type guards for cleaner code:

```typescript
import { 
  AletheiaA2AError,
  AgentNotFoundError,
  TrustScoreBelowThresholdError 
} from '@a2aletheia/a2a';

function isAletheiaError(error: unknown): error is AletheiaA2AError {
  return error instanceof AletheiaA2AError;
}

function isNoAgentsError(error: unknown): error is AgentNotFoundError {
  return error instanceof AgentNotFoundError;
}

function isTrustError(error: unknown): error is TrustScoreBelowThresholdError {
  return error instanceof TrustScoreBelowThresholdError;
}

// Usage
try {
  await client.sendByCapability('capability', 'input');
} catch (error) {
  if (isNoAgentsError(error)) {
    console.log('No available agents');
  } else if (isTrustError(error)) {
    console.log(`Trust score ${error.trustScore} too low`);
  } else if (isAletheiaError(error)) {
    console.log(`SDK error: ${error.code}`);
  }
}
```

### Circuit Breaker Pattern

Implement resilience for repeated failures:

```typescript
import { AgentNotLiveError, AletheiaA2AError } from '@a2aletheia/a2a';

class AgentCircuitBreaker {
  private failures = new Map<string, { count: number; lastFailure: number }>();
  private readonly threshold = 3;
  private readonly resetMs = 60000; // 1 minute

  async execute<T>(did: string, fn: () => Promise<T>): Promise<T> {
    const state = this.failures.get(did);
    
    if (state && state.count >= this.threshold) {
      const elapsed = Date.now() - state.lastFailure;
      if (elapsed < this.resetMs) {
        throw new Error(`Circuit open for agent ${did}`);
      }
      this.failures.delete(did);
    }

    try {
      const result = await fn();
      this.failures.delete(did);
      return result;
    } catch (error) {
      if (error instanceof AgentNotLiveError || error instanceof AletheiaA2AError) {
        const current = this.failures.get(did) ?? { count: 0, lastFailure: 0 };
        this.failures.set(did, {
          count: current.count + 1,
          lastFailure: Date.now()
        });
      }
      throw error;
    }
  }
}
```