---
layout: default
title: Context Store
nav_order: 5
parent: API Reference
nav_category: api
---

# Context Store

Context stores provide pluggable persistence for A2A conversation state across process restarts and serverless cold-starts. They store `contextId` and `taskId` to enable conversation continuity.

```typescript
import { ContextStore, StoredContext, redisContextStore, RedisLike } from "@a2aletheia/a2a";
```

## ContextStore Interface

The `ContextStore` interface defines the contract for persisting conversation context.

```typescript
interface ContextStore {
  get(key: string): Promise<StoredContext | null>;
  set(key: string, data: StoredContext): Promise<void>;
  delete(key: string): Promise<void>;
}
```

### Methods

#### `get(key: string): Promise<StoredContext | null>`

Retrieves stored context for the given key.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Unique identifier for the context |

**Returns:** `Promise<StoredContext | null>` - The stored context, or `null` if not found

---

#### `set(key: string, data: StoredContext): Promise<void>`

Stores context data for the given key.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Unique identifier for the context |
| `data` | `StoredContext` | Context data to store |

**Returns:** `Promise<void>`

---

#### `delete(key: string): Promise<void>`

Removes stored context for the given key.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Unique identifier for the context |

**Returns:** `Promise<void>`

---

## StoredContext Interface

Stored conversation state for a single agent connection.

```typescript
interface StoredContext {
  contextId?: string;
  taskId?: string;
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `contextId` | `string` (optional) | Opaque conversation identifier shared across related tasks |
| `taskId` | `string` (optional) | Current task identifier for long-running operations |

---

## RedisLike Interface

The `RedisLike` interface defines the minimal Redis client contract. Re-exported from `@a2aletheia/sdk/agent`.

```typescript
interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: (string | number)[]): Promise<unknown>;
  del(key: string): Promise<unknown>;
}
```

### Required Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `(key: string): Promise<string \| null>` | Retrieve a value by key |
| `set` | `(key: string, value: string, ...args: (string \| number)[]): Promise<unknown>` | Set a value with optional arguments (e.g., `"EX", ttl`) |
| `del` | `(key: string): Promise<unknown>` | Delete a key |

Compatible with ioredis, node-redis, and similar Redis clients.

---

## redisContextStore Function

Creates a `ContextStore` backed by any Redis-like client.

### Signature

```typescript
function redisContextStore(
  redis: RedisLike,
  options?: RedisContextStoreOptions
): ContextStore
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `redis` | `RedisLike` | Redis client instance (ioredis, node-redis, etc.) |
| `options` | `RedisContextStoreOptions` (optional) | Configuration options |

### RedisContextStoreOptions Interface

```typescript
interface RedisContextStoreOptions {
  prefix?: string;
  ttlSeconds?: number;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `prefix` | `string` | `"aletheia:ctx:"` | Key prefix for namespacing |
| `ttlSeconds` | `number` | `3600` (1 hour) | TTL in seconds. Set to `0` to disable |

### Default Values

- **Prefix:** `"aletheia:ctx:"`
- **TTL:** `3600` seconds (1 hour)

### Example with ioredis

```typescript
import IORedis from "ioredis";
import { redisContextStore } from "@a2aletheia/a2a";

const redis = new IORedis("redis://localhost:6379");
const store = redisContextStore(redis, {
  prefix: "myapp:context:",
  ttlSeconds: 1800 // 30 minutes
});

// Use with AletheiaA2A
const client = new AletheiaA2A({
  contextStore: store
});
```

### Example with node-redis

```typescript
import { createClient } from "redis";
import { redisContextStore } from "@a2aletheia/a2a";

const redis = createClient({ url: "redis://localhost:6379" });
await redis.connect();

const store = redisContextStore(redis, {
  ttlSeconds: 7200 // 2 hours
});

// Use with AletheiaA2A
const client = new AletheiaA2A({
  contextStore: store
});
```

---

## Creating Custom Stores

Implement the `ContextStore` interface to create stores backed by databases, file systems, or other storage systems.

### Interface Requirements

- Implement all three methods: `get`, `set`, `delete`
- All methods must be async (return Promises)
- `get` returns `null` when key not found
- Handle serialization/deserialization internally

### Database Example Skeleton

```typescript
import { ContextStore, StoredContext } from "@a2aletheia/a2a";

class PostgresContextStore implements ContextStore {
  constructor(private db: DatabaseClient) {}

  async get(key: string): Promise<StoredContext | null> {
    const row = await this.db.query(
      "SELECT context_id, task_id FROM context_store WHERE key = $1",
      [key]
    );
    if (!row) return null;
    return {
      contextId: row.context_id,
      taskId: row.task_id
    };
  }

  async set(key: string, data: StoredContext): Promise<void> {
    await this.db.query(
      `INSERT INTO context_store (key, context_id, task_id, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET
         context_id = $2,
         task_id = $3,
         updated_at = NOW()`,
      [key, data.contextId, data.taskId]
    );
  }

  async delete(key: string): Promise<void> {
    await this.db.query(
      "DELETE FROM context_store WHERE key = $1",
      [key]
    );
  }
}

// Usage
const store = new PostgresContextStore(db);
const client = new AletheiaA2A({
  contextStore: store
});
```
