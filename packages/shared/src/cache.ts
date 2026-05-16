import { createRequire } from "node:module";

const localRequire = createRequire(import.meta.url);

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

const KEY_PREFIX = "nc:";
const MEMORY_MAX = 500;

type Entry = { value: string; expiresAt: number };

class MemoryCache implements Cache {
  private readonly store = new Map<string, Entry>();

  constructor(private readonly max: number) {}

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return JSON.parse(entry.value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, {
      value: JSON.stringify(value),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    while (this.store.size > this.max) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

interface UpstashClient {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, opts: { ex: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

class UpstashCache implements Cache {
  constructor(private readonly client: UpstashClient) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(KEY_PREFIX + key);
    if (raw == null) return null;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    }
    return raw as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.client.set(KEY_PREFIX + key, JSON.stringify(value), {
      ex: ttlSeconds,
    });
  }

  async del(key: string): Promise<void> {
    await this.client.del(KEY_PREFIX + key);
  }
}

interface IoRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttl: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

class IoRedisCache implements Cache {
  constructor(private readonly client: IoRedisClient) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(KEY_PREFIX + key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.client.set(
      KEY_PREFIX + key,
      JSON.stringify(value),
      "EX",
      ttlSeconds,
    );
  }

  async del(key: string): Promise<void> {
    await this.client.del(KEY_PREFIX + key);
  }
}

let cached: Cache | null = null;

export function getCache(): Cache {
  if (cached) return cached;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upstashUrl && upstashToken) {
    const upstash = createUpstash(upstashUrl, upstashToken);
    if (upstash) {
      cached = upstash;
      return cached;
    }
  }

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const io = createIoRedis(redisUrl);
    if (io) {
      cached = io;
      return cached;
    }
  }

  cached = new MemoryCache(MEMORY_MAX);
  return cached;
}

function createUpstash(url: string, token: string): Cache | null {
  const moduleName = "@upstash/redis";
  try {
    const mod = localRequire(moduleName) as {
      Redis?: new (opts: { url: string; token: string }) => UpstashClient;
    };
    if (!mod.Redis) {
      console.warn("[cache] @upstash/redis missing Redis export; using memory cache");
      return null;
    }
    return new UpstashCache(new mod.Redis({ url, token }));
  } catch (err) {
    console.warn(
      "[cache] UPSTASH_REDIS_REST_URL set but @upstash/redis not loadable; using memory cache:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

function createIoRedis(url: string): Cache | null {
  const moduleName = "ioredis";
  try {
    const mod = localRequire(moduleName) as {
      default?: new (url: string) => IoRedisClient;
      Redis?: new (url: string) => IoRedisClient;
    };
    const Ctor = mod.default ?? mod.Redis;
    if (!Ctor) {
      console.warn("[cache] ioredis missing constructor; using memory cache");
      return null;
    }
    return new IoRedisCache(new Ctor(url));
  } catch (err) {
    console.warn(
      "[cache] REDIS_URL set but ioredis not loadable; using memory cache:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export function _resetCacheForTests(): void {
  cached = null;
}
