import type { ContextStore, RedisLike, StoredContext } from "./types.js";

const DEFAULT_PREFIX = "aletheia:ctx:";
const DEFAULT_TTL = 3600; // 1 hour

export interface RedisContextStoreOptions {
  /** Key prefix. Default: `"aletheia:ctx:"` */
  prefix?: string;
  /** TTL in seconds. Default: `3600` (1 hour). Set to `0` to disable. */
  ttlSeconds?: number;
}

/**
 * Create a {@link ContextStore} backed by any Redis-like client.
 *
 * ```ts
 * import IORedis from "ioredis";
 * import { redisContextStore } from "@a2aletheia/a2a";
 *
 * const redis = new IORedis("redis://localhost:6380");
 * const store = redisContextStore(redis, { ttlSeconds: 1800 });
 * ```
 */
export function redisContextStore(
  redis: RedisLike,
  options?: RedisContextStoreOptions,
): ContextStore {
  const prefix = options?.prefix ?? DEFAULT_PREFIX;
  const ttl = options?.ttlSeconds ?? DEFAULT_TTL;

  return {
    async get(key: string): Promise<StoredContext | null> {
      const raw = await redis.get(`${prefix}${key}`);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StoredContext;
      } catch {
        return null;
      }
    },

    async set(key: string, data: StoredContext): Promise<void> {
      const fullKey = `${prefix}${key}`;
      const value = JSON.stringify(data);
      if (ttl > 0) {
        await redis.set(fullKey, value, "EX", ttl);
      } else {
        await redis.set(fullKey, value);
      }
    },

    async delete(key: string): Promise<void> {
      await redis.del(`${prefix}${key}`);
    },
  };
}
