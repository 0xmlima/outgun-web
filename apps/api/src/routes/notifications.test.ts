// SPDX-License-Identifier: GPL-2.0-or-later
// Notificações (OG-361): convite de clã avisa o convidado, pedido de entrada avisa líder e admins;
// marcar uma ou todas como lidas; cada um só vê as suas.
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';

describe.skipIf(!pgAdminUrl)('notificações (OG-361)', () => {
  let t: TestDatabase;
  let app: App;
  let ip = 0;
  const cookies: Record<string, string> = {};

  function call(method: 'GET' | 'POST', url: string, payload?: unknown, who?: string): Promise<LightMyRequestResponse> {
    return app.inject({
      method,
      url,
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
      remoteAddress: `10.9.0.${++ip % 250}`,
      headers: { origin: ORIGIN, ...(who ? { cookie: cookies[who] } : {}) },
    });
  }
  const list = async (who: string) => (await call('GET', '/notifications', undefined, who)).json();

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    const config = { ...loadConfig({ REGISTER_PER_HOUR: '1000' }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
    for (const name of ['Chefe', 'Ana', 'Bia']) {
      const res = await call('POST', '/auth/register', { username: name, email: `${name}@x.com`, password: 'senha-boa-123' });
      cookies[name] = `og_session=${res.cookies.find((c: { name: string }) => c.name === 'og_session')!.value}`;
    }
    await call('POST', '/clans', { name: 'Lobos', tag: 'LB' }, 'Chefe');
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  it('convite avisa o convidado; marcar como lida', async () => {
    expect((await call('POST', '/clans/LB/invites', { username: 'Ana' }, 'Chefe')).statusCode).toBe(204);
    const ana = await list('Ana');
    expect(ana.unread).toBe(1);
    expect(ana.items[0]).toMatchObject({ kind: 'clan_invite', read: false, data: { clanTag: 'LB', clanName: 'Lobos', from: 'Chefe' } });
    expect((await call('POST', `/notifications/${ana.items[0].id}/read`, undefined, 'Bia')).statusCode).toBe(204); // de outra conta: nada muda
    expect((await list('Ana')).unread).toBe(1);
    expect((await call('POST', `/notifications/${ana.items[0].id}/read`, undefined, 'Ana')).statusCode).toBe(204);
    expect(await list('Ana')).toMatchObject({ unread: 0, items: [{ read: true }] });
  });

  it('pedido de entrada avisa a liderança; marcar todas como lidas', async () => {
    expect((await call('POST', '/clans/LB/requests', undefined, 'Bia')).statusCode).toBe(204);
    expect((await list('Chefe')).items[0]).toMatchObject({ kind: 'clan_request', data: { clanTag: 'LB', from: 'Bia' } });
    expect((await call('POST', '/notifications/read-all', undefined, 'Chefe')).statusCode).toBe(204);
    expect((await list('Chefe')).unread).toBe(0);
    expect((await list('Bia')).items).toEqual([]);
    expect((await call('GET', '/notifications')).statusCode).toBe(401);
  });
});
