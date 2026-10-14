// SPDX-License-Identifier: GPL-2.0-or-later
// Autenticação das rotas /internal (game server → API) por HMAC-SHA256 (OG-080; aqui desde o OG-046
// para o game server também assinar). O game server assina
// `timestamp.MÉTODO.caminho.sha256(corpo)` com o segredo do seu serverId e manda os cabeçalhos
// x-outgun-server, x-outgun-timestamp (ms) e x-outgun-signature (hex). Pedidos fora da janela de
// relógio são recusados, o que limita a reprodução de um pedido capturado.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface SignedHeaders {
  'x-outgun-server': string;
  'x-outgun-timestamp': string;
  'x-outgun-signature': string;
}

function payload(timestamp: string, method: string, path: string, body: string): string {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return `${timestamp}.${method.toUpperCase()}.${path}.${bodyHash}`;
}

/** Assina um pedido interno (usado pelo game server e pelos testes). */
export function signInternalRequest(
  serverId: string,
  secret: string,
  method: string,
  path: string,
  body: string,
  now = Date.now(),
): SignedHeaders {
  const timestamp = String(now);
  const signature = createHmac('sha256', secret).update(payload(timestamp, method, path, body)).digest('hex');
  return { 'x-outgun-server': serverId, 'x-outgun-timestamp': timestamp, 'x-outgun-signature': signature };
}

export type VerifyResult = { ok: true; serverId: string } | { ok: false; reason: string };

export function verifyInternalRequest(
  headers: Record<string, string | string[] | undefined>,
  method: string,
  path: string,
  body: string,
  secrets: Map<string, string[]>,
  maxSkewMs: number,
  now = Date.now(),
): VerifyResult {
  const serverId = headers['x-outgun-server'];
  const timestamp = headers['x-outgun-timestamp'];
  const signature = headers['x-outgun-signature'];
  if (typeof serverId !== 'string' || typeof timestamp !== 'string' || typeof signature !== 'string') {
    return { ok: false, reason: 'missing headers' };
  }
  // `base.instancia` (várias máquinas do mesmo grupo, OG-103) usa o segredo de `base`
  const instance = /^([^.]+)\.[a-z0-9]{1,32}$/.exec(serverId);
  const keys = secrets.get(serverId) ?? (instance ? secrets.get(instance[1] as string) : undefined);
  if (!keys) return { ok: false, reason: 'unknown server' };
  if (!/^\d{1,15}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > maxSkewMs) {
    return { ok: false, reason: 'stale timestamp' };
  }
  if (!/^[0-9a-f]{64}$/.test(signature)) return { ok: false, reason: 'bad signature' };
  const given = Buffer.from(signature, 'hex');
  const data = payload(timestamp, method, path, body);
  for (const key of keys) {
    if (timingSafeEqual(createHmac('sha256', key).update(data).digest(), given)) return { ok: true, serverId };
  }
  return { ok: false, reason: 'bad signature' };
}

/** INTERNAL_SECRETS="gs-1:segredo,gs-2:novo|antigo" (segredos com menos de 16 caracteres são ignorados). */
export function parseSecrets(value: string | undefined): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const entry of (value ?? '').split(',')) {
    const at = entry.indexOf(':');
    if (at <= 0) continue;
    const secrets = entry
      .slice(at + 1)
      .split('|')
      .filter((s) => s.length >= 16);
    if (secrets.length > 0) map.set(entry.slice(0, at).trim(), secrets);
  }
  return map;
}
