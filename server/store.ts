import { Redis } from '@upstash/redis'

/** Minimal key-value surface the API needs. Backed by Upstash Redis in production, memory in dev/tests. */
export interface Store {
  hset(key: string, field: string, value: string): Promise<void>
  hget(key: string, field: string): Promise<string | null>
  hgetall(key: string): Promise<Record<string, string>>
  hdel(key: string, field: string): Promise<void>
  hlen(key: string): Promise<number>
  del(...keys: string[]): Promise<void>
  expire(key: string, seconds: number): Promise<void>
  /** Seconds left, -1 if no expiry, -2 if the key does not exist (same as Redis). */
  ttl(key: string): Promise<number>
  /** Increment a counter; the first increment starts a window of `windowSeconds`. */
  incr(key: string, windowSeconds: number): Promise<number>
}

interface Entry {
  hash: Map<string, string>
  counter: number
  expiresAt: number | null
}

export class MemoryStore implements Store {
  private data = new Map<string, Entry>()
  private now: () => number
  /** Injectable clock so tests can fast-forward. */
  constructor(now: () => number = Date.now) {
    this.now = now
  }

  private live(key: string): Entry | undefined {
    const e = this.data.get(key)
    if (e && e.expiresAt !== null && e.expiresAt <= this.now()) {
      this.data.delete(key)
      return undefined
    }
    return e
  }
  private ensure(key: string): Entry {
    let e = this.live(key)
    if (!e) {
      e = { hash: new Map(), counter: 0, expiresAt: null }
      this.data.set(key, e)
    }
    return e
  }

  async hset(key: string, field: string, value: string) { this.ensure(key).hash.set(field, value) }
  async hget(key: string, field: string) { return this.live(key)?.hash.get(field) ?? null }
  async hgetall(key: string) { return Object.fromEntries(this.live(key)?.hash ?? []) }
  async hdel(key: string, field: string) {
    const e = this.live(key)
    e?.hash.delete(field)
    if (e && e.hash.size === 0 && e.counter === 0) this.data.delete(key)
  }
  async hlen(key: string) { return this.live(key)?.hash.size ?? 0 }
  async del(...keys: string[]) { keys.forEach((k) => this.data.delete(k)) }
  async expire(key: string, seconds: number) {
    const e = this.live(key)
    if (e) e.expiresAt = this.now() + seconds * 1000
  }
  async ttl(key: string) {
    const e = this.live(key)
    if (!e) return -2
    return e.expiresAt === null ? -1 : Math.ceil((e.expiresAt - this.now()) / 1000)
  }
  async incr(key: string, windowSeconds: number) {
    const e = this.ensure(key)
    e.counter += 1
    if (e.counter === 1) e.expiresAt = this.now() + windowSeconds * 1000
    return e.counter
  }
}

class UpstashStore implements Store {
  private r: Redis
  constructor(url: string, token: string) {
    // Values are JSON strings we serialise ourselves, so keep Upstash from re-parsing them.
    this.r = new Redis({ url, token, automaticDeserialization: false })
  }
  async hset(key: string, field: string, value: string) { await this.r.hset(key, { [field]: value }) }
  async hget(key: string, field: string) { return (await this.r.hget<string>(key, field)) ?? null }
  async hgetall(key: string) { return (await this.r.hgetall<Record<string, string>>(key)) ?? {} }
  async hdel(key: string, field: string) { await this.r.hdel(key, field) }
  async hlen(key: string) { return this.r.hlen(key) }
  async del(...keys: string[]) { if (keys.length) await this.r.del(...keys) }
  async expire(key: string, seconds: number) { await this.r.expire(key, seconds) }
  async ttl(key: string) { return this.r.ttl(key) }
  async incr(key: string, windowSeconds: number) {
    const n = await this.r.incr(key)
    if (n === 1) await this.r.expire(key, windowSeconds)
    return n
  }
}

const g = globalThis as { __splitlerMemoryStore?: MemoryStore }

/** Upstash when its env vars exist (Vercel Marketplace sets KV_* or UPSTASH_*), otherwise in-memory. */
export function getStore(): Store {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (url && token) return new UpstashStore(url, token)
  return (g.__splitlerMemoryStore ??= new MemoryStore())
}
