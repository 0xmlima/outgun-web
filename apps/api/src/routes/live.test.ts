// SPDX-License-Identifier: GPL-2.0-or-later
// Portal ao vivo (OG-284): o canal SSE avisa os tópicos e só a conta certa recebe as notificações.
import { request as httpRequest, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { liveBus } from '../live.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';

describe.skipIf(!pgAdminUrl)('portal ao vivo (OG-284)', () => {
  let t: TestDatabase;
  let app: App;
  let base: string;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    const config = { ...loadConfig({ REGISTER_PER_HOUR: '1000' }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  /** Abre o canal e junta os nomes dos eventos que chegarem. */
  const connect = (cookie?: string) =>
    new Promise<{ events: string[]; res: IncomingMessage; close: () => void }>((resolve, reject) => {
      const events: string[] = [];
      const req = httpRequest(`${base}/live`, { headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) } }, (res) => {
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          for (const m of chunk.matchAll(/^event: (\w+)$/gm)) events.push(m[1]!);
          if (events[0] === 'hello') resolve({ events, res, close: () => req.destroy() });
        });
      });
      req.on('error', reject);
      req.end();
    });
  const until = async (cond: () => boolean) => {
    for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 20));
  };

  it('avisa os tópicos públicos a todos e as notificações só à conta dela', async () => {
    const reg = await app.inject({ method: 'POST', url: '/auth/register', headers: { origin: ORIGIN }, payload: { username: 'Vivo', email: 'vivo@x.com', password: 'senha-boa-123' } });
    const cookie = `og_session=${reg.cookies.find((c) => c.name === 'og_session')!.value}`;
    const userId = reg.json().user.id as string;
    const anon = await connect();
    const mine = await connect(cookie);
    expect(anon.res.headers['content-type']).toContain('text/event-stream');
    liveBus.publish('rooms');
    liveBus.publish('rooms'); // dois em seguida viram um
    liveBus.publish('notifications', [userId]);
    await until(() => mine.events.length >= 3);
    await new Promise((r) => setTimeout(r, 300));
    expect(anon.events).toEqual(['hello', 'rooms']);
    expect(mine.events.sort()).toEqual(['hello', 'notifications', 'rooms']);
    anon.close();
    mine.close();
    await until(() => liveBus.size === 0);
    expect(liveBus.size).toBe(0);
  });

  it('no máximo 20 conexões por IP; a seguinte recebe 503 (a consulta periódica continua)', async () => {
    const open = await Promise.all(Array.from({ length: 20 }, () => connect()));
    const extra = await app.inject({ method: 'GET', url: '/live', headers: { origin: ORIGIN }, remoteAddress: '127.0.0.1' });
    expect(extra.statusCode).toBe(503);
    for (const c of open) c.close();
  });
});
