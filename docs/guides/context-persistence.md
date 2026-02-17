---
layout: default
title: Context Persistence
nav_order: 4
parent: Guides
nav_category: guides
---

# Context Persistence

Context persistence enables conversation continuity across process restarts and serverless cold-starts. This guide explains how to configure and use the context store to preserve conversation state between sessions.

## Overview

In serverless environments (AWS Lambda, Vercel Functions, Cloudflare Workers) and containerized deployments, your application may experience:

- **Cold starts**: New container instances spawn without previous memory state
- **Process restarts**: Deployments, crashes, or scaling events reset in-memory state
- **Connection drops**: Network issues may require re-establishing agent connections

Without persistence, each restart creates a fresh conversation—the agent has no memory of prior exchanges. Context persistence solves this by storing the essential conversation identifiers (`contextId` and `taskId`) in an external store.

## What Gets Persisted

The `StoredContext` interface captures minimal state needed for conversation continuity:

```typescript
interface StoredContext {
  contextId?: string;
  taskId?: string;
}
```

| Field | Description |
|-------|-------------|
| `contextId` | Links related messages in an ongoing conversation |
| `taskId` | Identifies the active task for resumable operations |

These identifiers are returned by A2A-compliant agents and enable you to continue a conversation where it left off after a restart.

## How Context Preservation Works

Context preservation requires cooperation between the orchestrator (this package) and the agent being called.

### Orchestrator Side (This Package)

The `TrustedAgent` class tracks conversation state:

1. **Captures identifiers from responses** - After each `send()` or `stream()`, stores `contextId` and `taskId`
2. **Forwards on subsequent requests** - Automatically includes stored identifiers in follow-up messages
3. **Persists via ContextStore** - External storage survives process restarts and cold-starts

```typescript
// First message - no context yet
const agent = await client.connect("did:web:agent.example.com");
const response1 = await agent.send("Hello");

// Orchestrator now has: contextId, taskId from response1

// Second message - orchestrator forwards context automatically
const response2 = await agent.send("Tell me more");
// Agent receives the same contextId, can continue conversation
```

### Agent Side (Required Cooperation)

For context preservation to work, **agents must return `contextId` in their responses**.

When using `@a2aletheia/sdk`, this happens automatically:

```typescript
import { AletheiaAgent } from "@a2aletheia/sdk/agent";

agent.handle(async (context, response) => {
  // context.contextId is the conversation identifier
  // All response methods automatically include it:
  response.text("Your request has been processed");
  // Response includes: { contextId: "...", taskId: "...", parts: [...] }
});
```

All `AgentResponse` methods (`text`, `data`, `working`, `done`, `fail`, etc.) automatically include `contextId` from the incoming request.

### Agent-Side State Preservation

Stateful agents (chat assistants, multi-step workflows) use `contextId` to store their own conversation history:

```typescript
// Agent's internal state management
const conversations = new Map<string, Message[]>();

agent.handle(async (context, response) => {
  const sessionId = context.contextId ?? "default";
  const history = conversations.get(sessionId) ?? [];
  
  // Process with history context...
  const reply = await processWithHistory(history, context.textContent);
  
  // Update stored history
  history.push({ role: "user", content: context.textContent });
  history.push({ role: "assistant", content: reply });
  conversations.set(sessionId, history);
  
  response.text(reply); // Automatically includes contextId
});
```

### Declaring Stateful Capability

Agents that support multi-turn conversations should declare this in their capabilities:

```typescript
const agent = new AletheiaAgent({
  // ...
  capabilities: {
    streaming: true,
    stateTransitionHistory: true,  // Signals conversation continuity support
  },
});
```

### What If Agents Don't Cooperate?

If an agent doesn't return `contextId` in responses:

1. Orchestrator receives `contextId: undefined`
2. Next request has no identifier to forward
3. Agent sees a fresh `contextId` each time
4. **No conversation continuity** — each message starts from scratch

This is why using `@a2aletheia/sdk` for agent development is recommended — it handles this automatically.

## The ContextStore Interface

The `ContextStore` interface defines a simple key-value contract:

```typescript
interface ContextStore {
  get(key: string): Promise<StoredContext | null>;
  set(key: string, data: StoredContext): Promise<void>;
  delete(key: string): Promise<void>;
}
```

Implementations can use any backing store—Redis, databases, file systems, or cloud-native solutions like DynamoDB.

## Built-in: Redis Context Store

The `redisContextStore` function creates a `ContextStore` backed by any Redis-compatible client.

### Using with ioredis

```typescript
import IORedis from "ioredis";
import { redisContextStore, AletheiaA2A } from "@a2aletheia/a2a";

const redis = new IORedis("redis://localhost:6379");

const store = redisContextStore(redis, {
  prefix: "myapp:ctx:",
  ttlSeconds: 3600,
});

const client = new AletheiaA2A({ contextStore: store });
```

### Using with node-redis

```typescript
import { createClient } from "redis";
import { redisContextStore, AletheiaA2A } from "@a2aletheia/a2a";

const redis = createClient({ url: "redis://localhost:6379" });
await redis.connect();

const store = redisContextStore(redis, {
  ttlSeconds: 7200,
});

const client = new AletheiaA2A({ contextStore: store });
```

### Configuration Options

```typescript
interface RedisContextStoreOptions {
  prefix?: string;     // Key prefix. Default: "aletheia:ctx:"
  ttlSeconds?: number; // TTL in seconds. Default: 3600 (1 hour). Set to 0 to disable.
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `prefix` | `"aletheia:ctx:"` | Namespace for all stored keys |
| `ttlSeconds` | `3600` | Expiration time; set to `0` for no expiration |

## Configuring AletheiaA2A

Pass the `contextStore` in your configuration:

```typescript
import { AletheiaA2A, redisContextStore } from "@a2aletheia/a2a";
import IORedis from "ioredis";

const redis = new IORedis(process.env.REDIS_URL!);
const store = redisContextStore(redis);

const client = new AletheiaA2A({
  contextStore: store,
  registryUrl: "https://registry.aletheia.ai",
  minTrustScore: 0.7,
});
```

## Scope-based Isolation

For multi-user applications, use the `scope` parameter in `connectByUrl` to isolate context per user or session:

```typescript
import { AletheiaA2A, redisContextStore } from "@a2aletheia/a2a";
import IORedis from "ioredis";

const redis = new IORedis(process.env.REDIS_URL!);
const store = redisContextStore(redis);

const client = new AletheiaA2A({ contextStore: store });

async function handleUserMessage(userId: string, message: string) {
  const agentUrl = "https://agent.example.com";
  
  const agent = await client.connectByUrl(agentUrl, { 
    scope: `user:${userId}` 
  });
  
  const response = await agent.send(message);
  return response;
}
```

The `scope` parameter ensures each user gets their own conversation context. Without it, all users would share the same context—incorrect for multi-tenant scenarios.

### How Scope Works

When you provide a scope:

```typescript
await client.connectByUrl(url, { scope: "user:123" });
```

The store key becomes: `"user:123:https://agent.example.com"`

This creates isolated contexts:

| Scope | Store Key |
|-------|-----------|
| `"user:alice"` | `"user:alice:https://agent.example.com"` |
| `"user:bob"` | `"user:bob:https://agent.example.com"` |
| `"session:abc"` | `"session:abc:https://agent.example.com"` |
| (no scope) | `"url:https://agent.example.com"` |

## Creating a Custom Store

Implement `ContextStore` for any backing store. Here's a PostgreSQL example using `pg`:

```typescript
import { Pool } from "pg";
import type { ContextStore, StoredContext } from "@a2aletheia/a2a";

class PostgresContextStore implements ContextStore {
  constructor(private pool: Pool) {}

  async get(key: string): Promise<StoredContext | null> {
    const result = await this.pool.query(
      "SELECT context_id, task_id FROM context_store WHERE key = $1",
      [key]
    );
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      contextId: row.context_id ?? undefined,
      taskId: row.task_id ?? undefined,
    };
  }

  async set(key: string, data: StoredContext): Promise<void> {
    await this.pool.query(
      `INSERT INTO context_store (key, context_id, task_id, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET
         context_id = EXCLUDED.context_id,
         task_id = EXCLUDED.task_id,
         updated_at = NOW()`,
      [key, data.contextId ?? null, data.taskId ?? null]
    );
  }

  async delete(key: string): Promise<void> {
    await this.pool.query("DELETE FROM context_store WHERE key = $1", [key]);
  }
}

async function setupStore(): Promise<ContextStore> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS context_store (
      key TEXT PRIMARY KEY,
      context_id TEXT,
      task_id TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  return new PostgresContextStore(pool);
}
```

### DynamoDB Example

```typescript
import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import type { ContextStore, StoredContext } from "@a2aletheia/a2a";

class DynamoContextStore implements ContextStore {
  private client: DynamoDBClient;
  private tableName: string;
  private ttlSeconds: number;

  constructor(tableName: string, ttlSeconds = 3600) {
    this.client = new DynamoDBClient({});
    this.tableName = tableName;
    this.ttlSeconds = ttlSeconds;
  }

  async get(key: string): Promise<StoredContext | null> {
    const result = await this.client.send(new GetItemCommand({
      TableName: this.tableName,
      Key: { pk: { S: key } },
    }));

    if (!result.Item) return null;

    return {
      contextId: result.Item.contextId?.S,
      taskId: result.Item.taskId?.S,
    };
  }

  async set(key: string, data: StoredContext): Promise<void> {
    const ttl = Math.floor(Date.now() / 1000) + this.ttlSeconds;
    
    await this.client.send(new PutItemCommand({
      TableName: this.tableName,
      Item: {
        pk: { S: key },
        contextId: { S: data.contextId ?? "" },
        taskId: { S: data.taskId ?? "" },
        ttl: { N: ttl.toString() },
      },
    }));
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteItemCommand({
      TableName: this.tableName,
      Key: { pk: { S: key } },
    }));
  }
}
```

## RedisLike Interface

The `redisContextStore` function accepts any client implementing `RedisLike`:

```typescript
interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(key: string): Promise<unknown>;
}
```

This interface matches the common subset of `ioredis` and `node-redis`, enabling either client. Third-party clients (Upstash, Redis Labs) that implement this interface also work.

## Context Lifecycle

Understanding when context is saved and restored ensures proper behavior:

### When Context is Saved

Context persists after each successful `send()` or `stream()` call:

```typescript
const agent = await client.connectByUrl(url, { scope: "user:123" });

// After send(), contextId and taskId are persisted
const response = await agent.send("Hello");

// After stream(), context updates with each yielded event
for await (const event of agent.stream("Tell me a story")) {
  console.log(event.kind);
}

// Context now available: agent.contextId, agent.lastTaskId
```

The internal `_persistContext()` method fires asynchronously (fire-and-forget) to avoid blocking responses.

### When Context is Restored

On `connectByUrl()` with a configured `contextStore`, the `restoreContext()` method loads any existing state:

```typescript
const agent = await client.connectByUrl(url, { scope: "user:123" });

// If context exists in store, agent.contextId and agent.lastTaskId are set
// If not, they remain undefined (fresh conversation)
```

### When Context is Reset

Call `resetContext()` to clear both in-memory and persisted state:

```typescript
const agent = await client.connectByUrl(url, { scope: "user:123" });
await agent.send("Hello");

// Later: start fresh
agent.resetContext();

// Next send() starts a new conversation
await agent.send("This is a new conversation");
```

`resetContext()` deletes the key from the store asynchronously (errors are silently ignored).

## Best Practices

### TTL Considerations

Choose TTL based on your use case:

| Scenario | Recommended TTL |
|----------|-----------------|
| Chatbots | 24 hours to 7 days |
| Task-based workflows | Match task timeout |
| One-time interactions | 1 hour (default) |
| Long-running sessions | 0 (no expiration) + manual cleanup |

```typescript
const store = redisContextStore(redis, {
  ttlSeconds: 86400, // 24 hours for chatbot
});
```

### Key Naming Conventions

Use descriptive prefixes to avoid collisions:

```typescript
const store = redisContextStore(redis, {
  prefix: "production:aletheia:context:",
});
```

For multi-environment deployments, include environment in the prefix:

```typescript
const env = process.env.NODE_ENV ?? "development";
const store = redisContextStore(redis, {
  prefix: `${env}:aletheia:ctx:`,
});
```

### Multi-Tenant Isolation

Always use meaningful scopes in production:

```typescript
const agent = await client.connectByUrl(url, {
  scope: `tenant:${tenantId}:user:${userId}`,
});
```

This prevents:
- Cross-user context leakage
- Conversation state corruption
- Security issues in shared infrastructure

### Error Handling

Context persistence is designed to be non-blocking. However, monitor for store errors:

```typescript
class LoggingContextStore implements ContextStore {
  private store: ContextStore;
  private logger: Logger;

  async get(key: string) {
    try {
      return await this.store.get(key);
    } catch (err) {
      this.logger.error("Context store get failed", { key, err });
      return null; // Graceful degradation
    }
  }

  async set(key: string, data: StoredContext) {
    try {
      await this.store.set(key, data);
    } catch (err) {
      this.logger.error("Context store set failed", { key, err });
    }
  }

  async delete(key: string) {
    try {
      await this.store.delete(key);
    } catch (err) {
      this.logger.error("Context store delete failed", { key, err });
    }
  }
}
```

### Connection Pooling

For Redis, reuse connections rather than creating new ones per request:

```typescript
import IORedis from "ioredis";

const redis = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

const store = redisContextStore(redis);
```

### Monitoring Context Usage

Track context restoration to understand cold-start behavior:

```typescript
const agent = await client.connectByUrl(url, { scope: "user:123" });

if (agent.contextId) {
  console.log("Resumed conversation", { contextId: agent.contextId });
} else {
  console.log("Started new conversation");
}
```