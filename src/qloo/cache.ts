import { requestKey, shortHash } from "./query";
import type { GetOptions, QlooTransport, TransportResult } from "./transport";
import type { QlooRequest } from "./types";

/** The subset of a Workers KV namespace this cache uses. */
export interface KvLike {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface Entry {
  value: TransportResult;
  expires: number;
}

/** A small least-recently-used map with per-entry expiry. */
export class LruCache<V> {
  readonly #max: number;
  readonly #map = new Map<string, { value: V; expires: number }>();

  constructor(max: number) {
    this.#max = Math.max(1, max);
  }

  get(key: string, now = Date.now()): V | undefined {
    const hit = this.#map.get(key);
    if (!hit) return undefined;
    if (hit.expires <= now) {
      this.#map.delete(key);
      return undefined;
    }
    this.#map.delete(key);
    this.#map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, ttlMs: number, now = Date.now()): void {
    this.#map.delete(key);
    this.#map.set(key, { value, expires: now + ttlMs });
    while (this.#map.size > this.#max) {
      const oldest = this.#map.keys().next().value;
      if (oldest === undefined) break;
      this.#map.delete(oldest);
    }
  }

  get size(): number {
    return this.#map.size;
  }
}

export interface CachingTransportOptions {
  ttlMs?: number;
  maxEntries?: number;
  kv?: KvLike;
  kvTtlSeconds?: number;
  now?: () => number;
}

/**
 * Caches answers per canonical request, so one seed set costs one round of
 * Qloo calls. Memory first; a KV namespace, when bound, shares answers across
 * Worker isolates. Identical requests that arrive together share one call.
 */
export class CachingTransport implements QlooTransport {
  readonly kind = "cache";
  readonly inner: QlooTransport;
  readonly #memory: LruCache<Entry["value"]>;
  readonly #ttlMs: number;
  readonly #kv: KvLike | undefined;
  readonly #kvTtl: number;
  readonly #now: () => number;
  readonly #inflight = new Map<string, Promise<TransportResult>>();

  constructor(inner: QlooTransport, options: CachingTransportOptions = {}) {
    this.inner = inner;
    this.#ttlMs = options.ttlMs ?? 6 * 60 * 60 * 1000;
    this.#memory = new LruCache(options.maxEntries ?? 400);
    this.#kv = options.kv;
    this.#kvTtl = options.kvTtlSeconds ?? 3 * 24 * 60 * 60;
    this.#now = options.now ?? Date.now;
  }

  async get(request: QlooRequest, options?: GetOptions): Promise<TransportResult> {
    const key = requestKey(request);
    const started = this.#now();
    const memoryHit = this.#memory.get(key, started);
    if (memoryHit) return { ...memoryHit, source: "cache", ms: 0 };

    const pending = this.#inflight.get(key);
    if (pending) return pending.then((result) => ({ ...result, source: "cache" as const, ms: this.#now() - started }));

    const work = (async () => {
      if (this.#kv) {
        try {
          const stored = (await this.#kv.get(`qloo:${shortHash(key)}`, "json")) as { body?: unknown; recordedAt?: string } | null;
          if (stored && stored.body !== undefined) {
            const result: TransportResult = { body: stored.body, source: "cache", ms: this.#now() - started };
            this.#memory.set(key, result, this.#ttlMs, this.#now());
            return result;
          }
        } catch {
          // KV is an optimisation; a read failure falls through to the source.
        }
      }
      const fresh = await this.inner.get(request, options);
      this.#memory.set(key, fresh, this.#ttlMs, this.#now());
      if (this.#kv && fresh.source === "live") {
        const payload = JSON.stringify({ body: fresh.body, recordedAt: new Date(this.#now()).toISOString() });
        // Writes are best effort and never block the answer.
        this.#kv.put(`qloo:${shortHash(key)}`, payload, { expirationTtl: this.#kvTtl }).catch(() => undefined);
      }
      return fresh;
    })();

    this.#inflight.set(key, work);
    try {
      return await work;
    } finally {
      this.#inflight.delete(key);
    }
  }
}
