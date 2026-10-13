// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { parseSecrets, signInternalRequest, verifyInternalRequest } from './internal.js';

const secrets = parseSecrets('gs-1:segredo-novo-0123456789|segredo-antigo-0123456789,gs-2:outro-segredo-0123456789');
const now = 1_760_000_000_000;
const body = '{"rooms":[]}';
const verify = (headers: Record<string, string>, b = body, at = now) =>
  verifyInternalRequest(headers, 'POST', '/internal/rooms/heartbeat', b, secrets, 30_000, at);

describe('HMAC das rotas internas', () => {
  it('aceita pedido assinado e informa o servidor', () => {
    const headers = signInternalRequest('gs-1', 'segredo-novo-0123456789', 'POST', '/internal/rooms/heartbeat', body, now);
    expect(verify({ ...headers })).toEqual({ ok: true, serverId: 'gs-1' });
  });

  it('aceita o segredo antigo durante a rotação', () => {
    const headers = signInternalRequest('gs-1', 'segredo-antigo-0123456789', 'POST', '/internal/rooms/heartbeat', body, now);
    expect(verify({ ...headers }).ok).toBe(true);
  });

  it('recusa corpo, caminho ou método adulterados', () => {
    const headers = { ...signInternalRequest('gs-1', 'segredo-novo-0123456789', 'POST', '/internal/rooms/heartbeat', body, now) };
    expect(verify(headers, '{"rooms":[1]}')).toEqual({ ok: false, reason: 'bad signature' });
    expect(verifyInternalRequest(headers, 'POST', '/internal/matches', body, secrets, 30_000, now).ok).toBe(false);
    expect(verifyInternalRequest(headers, 'PUT', '/internal/rooms/heartbeat', body, secrets, 30_000, now).ok).toBe(false);
  });

  it('recusa segredo de outro servidor e servidor desconhecido', () => {
    const forged = signInternalRequest('gs-1', 'outro-segredo-0123456789', 'POST', '/internal/rooms/heartbeat', body, now);
    expect(verify({ ...forged }).ok).toBe(false);
    const unknown = signInternalRequest('gs-9', 'segredo-novo-0123456789', 'POST', '/internal/rooms/heartbeat', body, now);
    expect(verify({ ...unknown })).toEqual({ ok: false, reason: 'unknown server' });
  });

  it('recusa pedido fora da janela de relógio (reprodução)', () => {
    const headers = signInternalRequest('gs-1', 'segredo-novo-0123456789', 'POST', '/internal/rooms/heartbeat', body, now);
    expect(verify({ ...headers }, body, now + 31_000)).toEqual({ ok: false, reason: 'stale timestamp' });
    expect(verify({ ...headers }, body, now - 31_000).ok).toBe(false);
  });

  it('recusa cabeçalhos ausentes ou malformados', () => {
    expect(verify({})).toEqual({ ok: false, reason: 'missing headers' });
    const headers = signInternalRequest('gs-1', 'segredo-novo-0123456789', 'POST', '/internal/rooms/heartbeat', body, now);
    expect(verify({ ...headers, 'x-outgun-signature': 'zz' }).ok).toBe(false);
  });

  it('ignora segredos curtos demais na configuração', () => {
    expect(parseSecrets('a:curto,b:longo-o-bastante-123').has('a')).toBe(false);
  });
});
