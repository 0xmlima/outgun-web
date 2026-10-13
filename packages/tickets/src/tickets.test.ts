// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import {
  exportSigningKey,
  fromJwks,
  generateSigningKey,
  parseSigningKeys,
  ReplayGuard,
  signTicket,
  TICKET_TTL_S,
  toJwks,
  verifyTicket,
  type TicketInput,
} from './index.js';

const input: TicketInput = { aud: 'main', sub: 'u-1', name: 'Ana', clan: '[BR]', acct: true, admin: false, ranked: false };
const now = 1_760_000_000_000;
const key = generateSigningKey('k1');
const keys = fromJwks(toJwks([key]));

describe('ticket de entrada (OG-083)', () => {
  it('assinado pela API e conferido com o JWKS público', () => {
    const r = verifyTicket(signTicket(input, key, now), keys, 'main', now);
    expect(r.ok && r.claims).toMatchObject({ ...input, iss: 'outgun-api', exp: now / 1000 + TICKET_TTL_S });
  });

  it('expira em 60 s (com 5 s de folga de relógio)', () => {
    const token = signTicket(input, key, now);
    expect(verifyTicket(token, keys, 'main', now + 64_000).ok).toBe(true);
    expect(verifyTicket(token, keys, 'main', now + 66_000)).toEqual({ ok: false, reason: 'expired' });
  });

  it('recusa ticket adulterado, de outra chave, de outra sala ou sem assinatura', () => {
    const token = signTicket(input, key, now);
    const [h, p, s] = token.split('.') as [string, string, string];
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), acct: true, admin: true })).toString('base64url');
    expect(verifyTicket(`${h}.${forged}.${s}`, keys, 'main', now)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyTicket(signTicket(input, generateSigningKey('k1'), now), keys, 'main', now)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyTicket(signTicket(input, generateSigningKey('k9'), now), keys, 'main', now)).toEqual({ ok: false, reason: 'unknown_key' });
    expect(verifyTicket(token, keys, 'ranked', now)).toEqual({ ok: false, reason: 'wrong_room' });
    const none = Buffer.from(JSON.stringify({ alg: 'none', kid: 'k1' })).toString('base64url');
    expect(verifyTicket(`${none}.${p}.`, keys, 'main', now)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyTicket('dev:Ana', keys, 'main', now)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rotação: a chave nova assina e a antiga continua valendo enquanto publicada', () => {
    const [newer, older] = parseSigningKeys(`${exportSigningKey(generateSigningKey('k2'))},${exportSigningKey(key)}`);
    expect(newer!.kid).toBe('k2');
    const published = fromJwks(toJwks([newer!, older!]));
    expect(verifyTicket(signTicket(input, newer!, now), published, 'main', now).ok).toBe(true);
    expect(verifyTicket(signTicket(input, key, now), published, 'main', now).ok).toBe(true);
  });

  it('o mesmo ticket não entra duas vezes', () => {
    const guard = new ReplayGuard();
    const r = verifyTicket(signTicket(input, key, now), keys, 'main', now);
    if (!r.ok) throw new Error();
    expect(guard.claim(r.claims, now)).toBe(true);
    expect(guard.claim(r.claims, now)).toBe(false);
  });
});
