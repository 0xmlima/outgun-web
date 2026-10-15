// SPDX-License-Identifier: GPL-2.0-or-later
// Convites e pedidos de entrada em clã (OG-271, RN-CLA-04, D-47): aceitar, recusar, expirar,
// aprovar, carência depois de sair e limite de membros.
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';
import { MAX_CLAN_MEMBERS } from './clans.js';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'senha-boa-123';

describe.skipIf(!pgAdminUrl)('convites e pedidos de clã (OG-271)', () => {
  let t: TestDatabase;
  let app: App;
  let ip = 0;
  const cookies: Record<string, string> = {};

  function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, who?: string): Promise<LightMyRequestResponse> {
    return app.inject({
      method,
      url,
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
      remoteAddress: `10.8.0.${++ip % 250}`,
      headers: { origin: ORIGIN, ...(who ? { cookie: cookies[who] } : {}) },
    });
  }
  const register = async (name: string) => {
    const res = await call('POST', '/auth/register', { username: name, email: `${name}@x.com`, password: PASSWORD });
    cookies[name] = `og_session=${res.cookies.find((c: { name: string }) => c.name === 'og_session')!.value}`;
  };
  const tagOf = async (who: string) => (await call('GET', '/auth/me', undefined, who)).json().user.clanTag;
  const inbox = async (who: string) => (await call('GET', '/clans/inbox', undefined, who)).json();

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    const config = { ...loadConfig({ REGISTER_PER_HOUR: '1000' }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
    for (const name of ['Chefe', 'Vice', 'Ana', 'Bia', 'Caio', 'Duda', 'Rival']) await register(name);
    await call('POST', '/clans', { name: 'Lobos', tag: 'LB' }, 'Chefe');
    await call('POST', '/clans', { name: 'Raposas', tag: 'RP' }, 'Rival');
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  it('convite aceito: entra como membro e os outros convites e pedidos caem', async () => {
    expect((await call('POST', '/clans/LB/invites', { username: 'Vice' }, 'Ana')).statusCode).toBe(403);
    expect((await call('POST', '/clans/LB/invites', { username: 'Ninguem' }, 'Chefe')).statusCode).toBe(404);
    expect((await call('POST', '/clans/LB/invites', { username: 'Vice' }, 'Chefe')).statusCode).toBe(204);
    expect((await call('POST', '/clans/RP/invites', { username: 'Vice' }, 'Rival')).statusCode).toBe(204);
    expect((await inbox('Vice')).invites.map((i: { tag: string }) => i.tag)).toEqual(['LB', 'RP']);
    expect((await call('POST', '/clans/LB/invites/accept', undefined, 'Vice')).statusCode).toBe(204);
    expect(await tagOf('Vice')).toBe('LB');
    expect((await inbox('Vice')).invites).toEqual([]);
    expect((await call('POST', '/clans/RP/invites/accept', undefined, 'Vice')).json().error).toBe('invite_not_found');
    await call('PUT', '/clans/LB/members/Vice/role', { role: 'admin' }, 'Chefe');
  });

  it('convite recusado e convite expirado', async () => {
    await call('POST', '/clans/LB/invites', { username: 'Ana' }, 'Vice');
    expect((await call('POST', '/clans/LB/invites/decline', undefined, 'Ana')).statusCode).toBe(204);
    expect((await call('POST', '/clans/LB/invites/accept', undefined, 'Ana')).json().error).toBe('invite_not_found');

    await call('POST', '/clans/LB/invites', { username: 'Ana' }, 'Vice');
    await t.sql`UPDATE clan_requests SET expires_at = now() - interval '1 second'`;
    expect((await inbox('Ana')).invites).toEqual([]);
    expect((await call('POST', '/clans/LB/invites/accept', undefined, 'Ana')).json().error).toBe('invite_not_found');
    expect(await tagOf('Ana')).toBeNull();
  });

  it('jogador em clã não aceita convite sem sair antes', async () => {
    await call('POST', '/clans/RP/invites', { username: 'Vice' }, 'Rival');
    expect((await call('POST', '/clans/RP/invites/accept', undefined, 'Vice')).json().error).toBe('already_in_clan');
  });

  it('pedido aprovado e pedido recusado; um pedido aberto por vez', async () => {
    expect((await call('POST', '/clans/LB/requests', undefined, 'Bia')).statusCode).toBe(204);
    expect((await call('POST', '/clans/RP/requests', undefined, 'Bia')).json().error).toBe('request_open');
    expect((await inbox('Chefe')).clanRequests).toBe(1);
    expect((await call('GET', '/clans/LB/pending', undefined, 'Vice')).json().requests).toEqual([expect.objectContaining({ username: 'Bia' })]);
    expect((await call('POST', '/clans/LB/requests/Bia/approve', undefined, 'Bia')).statusCode).toBe(403);
    expect((await call('POST', '/clans/LB/requests/Bia/approve', undefined, 'Vice')).statusCode).toBe(204);
    expect(await tagOf('Bia')).toBe('LB');

    expect((await call('POST', '/clans/LB/requests', undefined, 'Caio')).statusCode).toBe(204);
    expect((await call('POST', '/clans/LB/requests/Caio/decline', undefined, 'Chefe')).statusCode).toBe(204);
    expect((await call('POST', '/clans/LB/requests/Caio/approve', undefined, 'Chefe')).json().error).toBe('request_not_found');
    expect(await tagOf('Caio')).toBeNull();
    // recusado, pode pedir a outro clã; e retirar o pedido
    expect((await call('POST', '/clans/RP/requests', undefined, 'Caio')).statusCode).toBe(204);
    expect((await call('DELETE', '/clans/RP/requests', undefined, 'Caio')).statusCode).toBe(204);
  });

  it('carência de 7 dias depois de sair ou ser expulso; dissolução não gera carência', async () => {
    expect((await call('POST', '/clans/LB/leave', undefined, 'Bia')).json().result).toBe('left');
    expect((await call('POST', '/clans/RP/requests', undefined, 'Bia')).json().error).toBe('clan_cooldown');
    await call('POST', '/clans/RP/invites', { username: 'Bia' }, 'Rival');
    expect((await call('POST', '/clans/RP/invites/accept', undefined, 'Bia')).json().error).toBe('clan_cooldown');
    expect((await inbox('Bia')).cooldownUntil).not.toBeNull();
    await t.sql`UPDATE users SET clan_cooldown_until = now() - interval '1 second' WHERE username = 'Bia'`;
    expect((await call('POST', '/clans/RP/invites/accept', undefined, 'Bia')).statusCode).toBe(204);

    await call('POST', '/clans/LB/invites', { username: 'Caio' }, 'Chefe');
    await call('POST', '/clans/LB/invites/accept', undefined, 'Caio');
    expect((await call('DELETE', '/clans/LB/members/Caio', undefined, 'Vice')).statusCode).toBe(204);
    expect((await call('POST', '/clans/RP/requests', undefined, 'Caio')).json().error).toBe('clan_cooldown');

    await call('POST', '/clans', { name: 'Efêmero', tag: 'EF' }, 'Duda');
    expect((await call('DELETE', '/clans/EF', undefined, 'Duda')).statusCode).toBe(204);
    expect((await call('POST', '/clans/LB/requests', undefined, 'Duda')).statusCode).toBe(204);
  });

  it(`limite de ${MAX_CLAN_MEMBERS} membros: convite e aprovação recusados com o clã cheio`, async () => {
    // Lobos tem Chefe e Vice; completa com contas criadas direto no banco
    await t.sql`
      INSERT INTO users (username, username_key, email, email_key, password_hash)
      SELECT 'f' || i, 'f' || i, 'f' || i || '@x', 'f' || i || '@x', 'x' FROM generate_series(1, ${MAX_CLAN_MEMBERS - 2}) i`;
    await t.sql`
      INSERT INTO clan_members (user_id, clan_id, role)
      SELECT u.id, c.id, 'member' FROM users u, clans c WHERE u.username LIKE 'f%' AND c.tag = 'LB'`;
    expect((await call('POST', '/clans/LB/invites', { username: 'Ana' }, 'Chefe')).json().error).toBe('clan_full');
    expect((await call('POST', '/clans/LB/requests/Duda/approve', undefined, 'Chefe')).json().error).toBe('clan_full');
  });
});
