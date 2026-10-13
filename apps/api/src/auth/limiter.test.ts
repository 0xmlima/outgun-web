// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { checkName } from './names.js';
import { LoginThrottle, MemoryCounterStore, RateLimit } from './limiter.js';

describe('LoginThrottle (RN-PLT-06)', () => {
  it('libera 5 falhas e depois espera 30 s, 60 s, 120 s... até 15 min', () => {
    expect([4, 5, 6, 7, 20].map((n) => LoginThrottle.waitFor(n, 5))).toEqual([0, 30_000, 60_000, 120_000, 900_000]);
  });

  it('a espera conta da última falha e um login correto zera o usuário', async () => {
    let now = 1_000_000;
    const throttle = new LoginThrottle(new MemoryCounterStore(() => now), () => now);
    const keys = [{ key: 'user:ana', free: 5 }];
    for (let i = 0; i < 4; i++) await throttle.fail(keys);
    expect(await throttle.retryAfter(keys)).toBe(0);
    await throttle.fail(keys);
    expect(await throttle.retryAfter(keys)).toBe(30_000);
    now += 29_000;
    expect(await throttle.retryAfter(keys)).toBe(1_000);
    now += 1_000;
    expect(await throttle.retryAfter(keys)).toBe(0);
    await throttle.fail(keys);
    expect(await throttle.retryAfter(keys)).toBe(60_000);
    await throttle.succeed('user:ana');
    expect(await throttle.retryAfter(keys)).toBe(0);
  });

  it('esquece as falhas 1 h depois da última', async () => {
    let now = 0;
    const throttle = new LoginThrottle(new MemoryCounterStore(() => now), () => now);
    const keys = [{ key: 'ip:1.2.3.4', free: 2 }];
    await throttle.fail(keys);
    await throttle.fail(keys);
    now += LoginThrottle.WINDOW_MS;
    expect(await throttle.retryAfter(keys)).toBe(0);
  });

  it('RateLimit conta pedidos por janela', async () => {
    let now = 0;
    const limit = new RateLimit(new MemoryCounterStore(() => now));
    expect(await limit.allow('k', 2, 1000)).toBe(true);
    expect(await limit.allow('k', 2, 1000)).toBe(true);
    expect(await limit.allow('k', 2, 1000)).toBe(false);
    now += 1000;
    expect(await limit.allow('k', 2, 1000)).toBe(true);
  });
});

describe('checkName (RN-NOM-01, check_name)', () => {
  it.each([
    ['Jogador', true],
    ['José da Silva', true],
    ['123456789012345', true],
    ['1234567890123456', false],
    ['', false],
    ['   ', false],
    ['\u00a0\u00a0', false],
    [' Ana', false],
    ['Ana ', false],
    ['Ana\u00a0', false],
    ['A\tB', false],
    ['A\u0085B', false],
    ['Ελένη', false],
    ['ÿ~!@#', true],
  ])('%j → %s', (name, ok) => {
    expect(checkName(name)).toBe(ok);
  });
});
