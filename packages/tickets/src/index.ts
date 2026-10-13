// SPDX-License-Identifier: GPL-2.0-or-later
// Ticket de entrada no game server (OG-083, PLAN 5.4): JWT compacto assinado com Ed25519 ("EdDSA").
// A API assina com a chave privada; os game servers só têm as chaves públicas (JWKS) e não
// conseguem emitir tickets. Várias chaves (kid) permitem a rotação: publica-se a nova, passa-se a
// assinar com ela e a antiga sai depois que os tickets dela venceram (60 s).
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, verify, type KeyObject } from 'node:crypto';

export const TICKET_ISSUER = 'outgun-api';
export const TICKET_TTL_S = 60;

export interface TicketClaims {
  iss: typeof TICKET_ISSUER;
  /** Sala para a qual o ticket vale. */
  aud: string;
  /** Id da conta, ou `guest:<uuid>` para convidados. */
  sub: string;
  /** Nome em jogo (convidado já com o sufixo `*`). */
  name: string;
  clan: string | null;
  /** Tem conta (requisito do Ranked, RN-MOD-03). */
  acct: boolean;
  admin: boolean;
  /** Sala Ranked (a partida conta para o ranking, RN-RNK-01). */
  ranked: boolean;
  iat: number;
  exp: number;
  /** Id único: um ticket abre uma conexão só. */
  jti: string;
}

export type TicketInput = Omit<TicketClaims, 'iss' | 'iat' | 'exp' | 'jti'>;

export interface SigningKey {
  kid: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
}

const b64 = (data: Buffer | string) => Buffer.from(data).toString('base64url');
const json = (value: unknown) => b64(JSON.stringify(value));

export function generateSigningKey(kid: string): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { kid, privateKey, publicKey };
}

/** Chave privada em base64 (PKCS#8 DER), como vai na variável de ambiente. */
export function exportSigningKey(key: SigningKey): string {
  return `${key.kid}:${key.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')}`;
}

/** TICKET_SIGNING_KEYS="kid:base64pkcs8,kid2:..." — a primeira assina; todas são publicadas. */
export function parseSigningKeys(value: string): SigningKey[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const at = entry.indexOf(':');
      if (at <= 0) throw new Error('TICKET_SIGNING_KEYS: use kid:chave');
      const privateKey = createPrivateKey({ key: Buffer.from(entry.slice(at + 1), 'base64'), format: 'der', type: 'pkcs8' });
      if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('TICKET_SIGNING_KEYS: a chave tem de ser Ed25519');
      return { kid: entry.slice(0, at), privateKey, publicKey: createPublicKey(privateKey) };
    });
}

export function signTicket(input: TicketInput, key: SigningKey, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const claims: TicketClaims = { iss: TICKET_ISSUER, ...input, iat, exp: iat + TICKET_TTL_S, jti: randomUUID() };
  const head = `${json({ alg: 'EdDSA', typ: 'JWT', kid: key.kid })}.${json(claims)}`;
  return `${head}.${b64(sign(null, Buffer.from(head), key.privateKey))}`;
}

export interface Jwk {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
  kid: string;
  alg: 'EdDSA';
  use: 'sig';
}

export function toJwks(keys: readonly SigningKey[]): { keys: Jwk[] } {
  return {
    keys: keys.map((k) => {
      const jwk = k.publicKey.export({ format: 'jwk' }) as { x: string };
      return { kty: 'OKP', crv: 'Ed25519', x: jwk.x, kid: k.kid, alg: 'EdDSA', use: 'sig' };
    }),
  };
}

/** Chaves públicas (kid → chave) a partir de um JWKS; ignora entradas que não sejam Ed25519. */
export function fromJwks(jwks: unknown): Map<string, KeyObject> {
  const map = new Map<string, KeyObject>();
  const list = (jwks as { keys?: unknown })?.keys;
  if (!Array.isArray(list)) return map;
  for (const k of list as Partial<Jwk>[]) {
    if (k.kty !== 'OKP' || k.crv !== 'Ed25519' || typeof k.x !== 'string' || typeof k.kid !== 'string') continue;
    map.set(k.kid, createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: k.x }, format: 'jwk' }));
  }
  return map;
}

export type VerifyResult =
  | { ok: true; claims: TicketClaims }
  | { ok: false; reason: 'malformed' | 'unknown_key' | 'bad_signature' | 'expired' | 'wrong_room' };

/** Confere formato, chave, assinatura, validade (±5 s de folga de relógio) e sala. */
export function verifyTicket(
  token: string,
  keys: ReadonlyMap<string, KeyObject>,
  room: string,
  now = Date.now(),
): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 2048) return { ok: false, reason: 'malformed' };
  const [h, p, s] = parts as [string, string, string];
  let header: { alg?: unknown; kid?: unknown };
  let claims: Partial<TicketClaims>;
  try {
    header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  // Só EdDSA: nada de "alg: none" nem de trocar o algoritmo.
  if (header.alg !== 'EdDSA' || typeof header.kid !== 'string') return { ok: false, reason: 'malformed' };
  const key = keys.get(header.kid);
  if (!key) return { ok: false, reason: 'unknown_key' };
  if (!verify(null, Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) return { ok: false, reason: 'bad_signature' };
  if (
    claims.iss !== TICKET_ISSUER ||
    typeof claims.aud !== 'string' ||
    typeof claims.sub !== 'string' ||
    typeof claims.name !== 'string' ||
    typeof claims.exp !== 'number' ||
    typeof claims.iat !== 'number' ||
    typeof claims.jti !== 'string'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  const t = now / 1000;
  if (t > claims.exp + 5 || t < claims.iat - 5) return { ok: false, reason: 'expired' };
  if (claims.aud !== room) return { ok: false, reason: 'wrong_room' };
  return { ok: true, claims: claims as TicketClaims };
}

/** Lembra os jti usados até vencerem: o mesmo ticket não abre duas conexões. */
export class ReplayGuard {
  private readonly seen = new Map<string, number>();

  /** true na primeira vez que o jti aparece. */
  claim(claims: Pick<TicketClaims, 'jti' | 'exp'>, now = Date.now()): boolean {
    const t = now / 1000;
    for (const [jti, exp] of this.seen) if (exp + 5 < t) this.seen.delete(jti);
    if (this.seen.has(claims.jti)) return false;
    this.seen.set(claims.jti, claims.exp);
    return true;
  }
}
