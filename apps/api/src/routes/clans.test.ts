// SPDX-License-Identifier: GPL-2.0-or-later
// Clãs (OG-270, RN-CLA-01..05, D-47): unicidade de nome e tag, um clã por jogador, papéis, saída do
// líder e dissolução. A tag no ticket está em join.test.ts.
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { clanMembers } from '../db/schema.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';
import { leaveClan } from './clans.js';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'senha-boa-123';

describe.skipIf(!pgAdminUrl)('clãs (OG-270)', () => {
  let t: TestDatabase;
  let app: App;
  let ip = 0;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    const config = { ...loadConfig({ REGISTER_PER_HOUR: '1000' }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
    for (const name of ['Lider', 'Adm1', 'Adm2', 'Memb1', 'Memb2', 'Outro', 'Sozinho']) {
      const res = await call('POST', '/auth/register', { username: name, email: `${name}@x.com`, password: PASSWORD });
      cookies[name] = `og_session=${res.cookies.find((c: { name: string }) => c.name === 'og_session')!.value}`;
    }
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown, who?: string): Promise<LightMyRequestResponse> {
    return app.inject({
      method,
      url,
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
      remoteAddress: `10.7.0.${++ip}`,
      headers: { origin: ORIGIN, ...(who ? { cookie: cookies[who] } : {}) },
    });
  }
  const me = async (who: string) => (await call('GET', '/auth/me', undefined, who)).json().user;
  const clan = async (tag: string) => (await call('GET', `/clans/${encodeURIComponent(tag)}`)).json().clan;
  const roles = async (tag: string) => Object.fromEntries((await clan(tag)).members.map((m: { username: string; role: string }) => [m.username, m.role]));
  /** Põe a conta no clã direto no banco (convites e pedidos são do OG-271). */
  const join = async (who: string, tag: string, role: 'admin' | 'member' = 'member') => {
    const [row] = await t.sql`SELECT id FROM clans WHERE tag_key = lower(${tag})`;
    await t.db.insert(clanMembers).values({ userId: (await me(who)).id, clanId: row!.id as string, role });
  };

  it('cria o clã, o criador vira líder e a tag aparece na conta', async () => {
    const res = await call('POST', '/clans', { name: 'Os Ñandus', tag: 'nn', description: 'oi' }, 'Lider');
    expect(res.statusCode).toBe(201);
    expect(res.json().clan).toMatchObject({ name: 'Os Ñandus', tag: 'nn', description: 'oi', members: [{ username: 'Lider', role: 'leader' }] });
    expect((await me('Lider')).clanTag).toBe('nn');
    expect(await clan('NN')).toMatchObject({ tag: 'nn' });
  });

  it('tag e nome repetidos são recusados sem diferença de maiúsculas e acentos', async () => {
    expect((await call('POST', '/clans', { name: 'Outro Clã', tag: 'NN' }, 'Outro')).json().error).toBe('clan_tag_taken');
    expect((await call('POST', '/clans', { name: 'Outro Clã', tag: 'ÑN' }, 'Outro')).json().error).toBe('clan_tag_taken');
    expect((await call('POST', '/clans', { name: 'os nandus', tag: 'ZZ' }, 'Outro')).json().error).toBe('clan_name_taken');
    expect((await call('POST', '/clans', { name: 'Outro Clã', tag: 'ABC' }, 'Outro')).statusCode).toBe(400);
    expect((await call('POST', '/clans', { name: 'Outro Clã', tag: '(' }, 'Outro')).json().error).toBe('invalid_clan_tag');
    expect((await call('POST', '/clans', { name: 'ab', tag: 'ZZ' }, 'Outro')).json().error).toBe('invalid_clan_name');
    expect((await call('POST', '/clans', { name: 'Outro Clã', tag: 'ZZ' })).statusCode).toBe(401);
  });

  it('jogador não entra em dois clãs', async () => {
    expect((await call('POST', '/clans', { name: 'Segundo', tag: 'S2' }, 'Lider')).json().error).toBe('already_in_clan');
    expect((await call('POST', '/clans', { name: 'Outro Clã', tag: 'OC' }, 'Outro')).statusCode).toBe(201);
    await expect(join('Outro', 'nn')).rejects.toThrow();
  });

  it('papéis: admins editam nome e descrição; só o líder muda a tag e promove', async () => {
    await join('Adm1', 'nn', 'admin');
    await join('Memb1', 'nn');
    await join('Memb2', 'nn');
    expect((await call('PATCH', '/clans/nn', { description: 'nova' }, 'Adm1')).json().clan.description).toBe('nova');
    expect((await call('PATCH', '/clans/nn', { tag: 'NX' }, 'Adm1')).statusCode).toBe(403);
    expect((await call('PATCH', '/clans/nn', { description: 'x' }, 'Memb1')).statusCode).toBe(403);
    expect((await call('PATCH', '/clans/nn', { tag: 'OC' }, 'Lider')).json().error).toBe('clan_tag_taken');
    expect((await call('PUT', '/clans/nn/members/Memb1/role', { role: 'admin' }, 'Adm1')).statusCode).toBe(403);

    expect((await call('PATCH', '/clans/nn', { tag: 'NX' }, 'Lider')).json().clan.tag).toBe('NX');
    expect((await me('Memb2')).clanTag).toBe('NX');
    expect((await call('GET', '/clans/nn')).statusCode).toBe(404);
  });

  it('expulsar: admin só expulsa membro comum; ninguém expulsa o líder', async () => {
    await join('Adm2', 'NX');
    expect((await call('PUT', '/clans/NX/members/Adm2/role', { role: 'admin' }, 'Lider')).json().clan.members).toContainEqual(
      expect.objectContaining({ username: 'Adm2', role: 'admin' }),
    );
    expect((await call('DELETE', '/clans/NX/members/Adm2', undefined, 'Adm1')).statusCode).toBe(403);
    expect((await call('DELETE', '/clans/NX/members/Lider', undefined, 'Adm1')).statusCode).toBe(403);
    expect((await call('DELETE', '/clans/NX/members/Memb2', undefined, 'Adm1')).statusCode).toBe(204);
    expect((await me('Memb2')).clanTag).toBeNull();
    expect((await call('DELETE', '/clans/NX/members/Ninguem', undefined, 'Lider')).statusCode).toBe(404);
  });

  it('transferir a liderança: o antigo líder vira admin', async () => {
    expect((await call('POST', '/clans/NX/transfer', { username: 'Memb1' }, 'Adm1')).statusCode).toBe(403);
    expect((await call('POST', '/clans/NX/transfer', { username: 'Memb1' }, 'Lider')).statusCode).toBe(200);
    expect(await roles('NX')).toEqual({ Memb1: 'leader', Lider: 'admin', Adm1: 'admin', Adm2: 'admin' });
    expect((await call('POST', '/clans/NX/transfer', { username: 'Lider' }, 'Memb1')).statusCode).toBe(200);
    expect(await roles('NX')).toEqual({ Lider: 'leader', Adm1: 'admin', Adm2: 'admin', Memb1: 'admin' });
  });

  it('líder que sai passa a liderança ao admin mais antigo; o último dissolve o clã', async () => {
    expect((await call('POST', '/clans/NX/leave', undefined, 'Lider')).json().result).toBe('left');
    expect((await roles('NX')).Adm1).toBe('leader');
    expect((await me('Lider')).clanTag).toBeNull();
    // sem admins, a liderança vai ao membro mais antigo
    await call('PUT', '/clans/NX/members/Adm2/role', { role: 'member' }, 'Adm1');
    await call('PUT', '/clans/NX/members/Memb1/role', { role: 'member' }, 'Adm1');
    expect((await call('POST', '/clans/NX/leave', undefined, 'Adm1')).json().result).toBe('left');
    expect((await roles('NX')).Adm2).toBe('leader');
    expect((await call('POST', '/clans/NX/leave', undefined, 'Memb1')).json().result).toBe('left');
    expect((await call('POST', '/clans/NX/leave', undefined, 'Adm2')).json().result).toBe('dissolved');
    expect((await call('GET', '/clans/NX')).statusCode).toBe(404);
  });

  it('dissolver é só do líder; os membros ficam sem tag', async () => {
    await join('Sozinho', 'OC');
    expect((await call('DELETE', '/clans/OC', undefined, 'Sozinho')).statusCode).toBe(403);
    expect((await call('DELETE', '/clans/OC', undefined, 'Outro')).statusCode).toBe(204);
    expect((await me('Sozinho')).clanTag).toBeNull();
  });

  it('busca por começo do nome ou pela tag', async () => {
    await call('POST', '/clans', { name: 'Águias', tag: 'AG' }, 'Lider');
    await call('POST', '/clans', { name: 'Agulhas', tag: 'GU' }, 'Outro');
    expect((await call('GET', '/clans?busca=ag')).json()).toMatchObject({ total: 2, clans: [{ tag: 'AG' }, { tag: 'GU' }] });
    expect((await call('GET', '/clans?busca=gu')).json().clans).toEqual([expect.objectContaining({ name: 'Agulhas', members: 1 })]);
  });

  it('conta excluída sai do clã pela regra do líder', async () => {
    await join('Memb2', 'AG');
    expect(await t.db.transaction((tx) => leaveClan(tx, '00000000-0000-0000-0000-000000000000'))).toBe('none');
    const res = await call('DELETE', '/account', { password: PASSWORD }, 'Lider');
    expect(res.statusCode).toBe(204);
    expect(await roles('AG')).toEqual({ Memb2: 'leader' });
  });
});
