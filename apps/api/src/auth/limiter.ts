// SPDX-License-Identifier: GPL-2.0-or-later
// Contadores de tentativas: em memória (um processo) ou no Redis (vários processos da API).
import type { Redis } from 'ioredis';

export interface CounterStore {
  /** Soma 1 ao contador e devolve o novo valor; a chave expira `ttlMs` depois da última soma. */
  increment(key: string, ttlMs: number): Promise<number>;
  get(key: string): Promise<number>;
  set(key: string, value: number, ttlMs: number): Promise<void>;
  reset(key: string): Promise<void>;
}

export class MemoryCounterStore implements CounterStore {
  private readonly counters = new Map<string, { count: number; expires: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string) {
    const entry = this.counters.get(key);
    if (entry && entry.expires <= this.now()) {
      this.counters.delete(key);
      return undefined;
    }
    return entry;
  }

  async increment(key: string, ttlMs: number): Promise<number> {
    const entry = this.live(key) ?? { count: 0, expires: 0 };
    entry.count++;
    entry.expires = this.now() + ttlMs;
    this.counters.set(key, entry);
    if (this.counters.size > 100_000) this.prune();
    return entry.count;
  }

  async get(key: string): Promise<number> {
    return this.live(key)?.count ?? 0;
  }

  async set(key: string, value: number, ttlMs: number): Promise<void> {
    this.counters.set(key, { count: value, expires: this.now() + ttlMs });
  }

  async reset(key: string): Promise<void> {
    this.counters.delete(key);
  }

  private prune() {
    const now = this.now();
    for (const [key, entry] of this.counters) if (entry.expires <= now) this.counters.delete(key);
  }
}

export class RedisCounterStore implements CounterStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'og:limit:',
  ) {}

  async increment(key: string, ttlMs: number): Promise<number> {
    const k = this.prefix + key;
    const [[, count]] = (await this.redis.multi().incr(k).pexpire(k, ttlMs).exec()) as [[unknown, number]];
    return count;
  }

  async get(key: string): Promise<number> {
    return Number((await this.redis.get(this.prefix + key)) ?? 0);
  }

  async set(key: string, value: number, ttlMs: number): Promise<void> {
    await this.redis.set(this.prefix + key, String(value), 'PX', ttlMs);
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }
}

/**
 * Espera crescente depois de `freeFailures` falhas (RN-PLT-06): 30 s, 60 s, 120 s... até 15 min.
 * A espera conta a partir da última falha; o contador zera 1 h depois dela ou num login correto.
 */
export class LoginThrottle {
  static readonly BASE_MS = 30_000;
  static readonly MAX_MS = 15 * 60_000;
  static readonly WINDOW_MS = 60 * 60_000;

  constructor(
    private readonly store: CounterStore,
    private readonly now: () => number = Date.now,
  ) {}

  static waitFor(failures: number, freeFailures: number): number {
    if (failures < freeFailures) return 0;
    return Math.min(LoginThrottle.MAX_MS, LoginThrottle.BASE_MS * 2 ** (failures - freeFailures));
  }

  /** Milissegundos que ainda faltam esperar (0 = pode tentar). */
  async retryAfter(keys: readonly { key: string; free: number }[]): Promise<number> {
    let wait = 0;
    for (const { key, free } of keys) {
      const failures = await this.store.get(`fail:${key}`);
      if (failures < free) continue;
      const last = await this.store.get(`last:${key}`);
      wait = Math.max(wait, last + LoginThrottle.waitFor(failures, free) - this.now());
    }
    return Math.max(0, wait);
  }

  async fail(keys: readonly { key: string }[]): Promise<void> {
    for (const { key } of keys) {
      await this.store.increment(`fail:${key}`, LoginThrottle.WINDOW_MS);
      await this.store.set(`last:${key}`, this.now(), LoginThrottle.WINDOW_MS);
    }
  }

  async succeed(key: string): Promise<void> {
    await this.store.reset(`fail:${key}`);
    await this.store.reset(`last:${key}`);
  }
}

/** Limite simples por janela fixa (cadastro, recuperação de senha). */
export class RateLimit {
  constructor(private readonly store: CounterStore) {}

  /** Conta um pedido; devolve false se `key` passou de `limit` pedidos na janela. */
  async allow(key: string, limit: number, windowMs: number): Promise<boolean> {
    return (await this.store.increment(`rate:${key}`, windowMs)) <= limit;
  }
}
