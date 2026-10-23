// SPDX-License-Identifier: GPL-2.0-or-later
// Nomes de conta (OG-082): comparação normalizada, convidados, troca de nome com carência e
// reserva.
import { eq } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { checkGuestName } from '../auth/names.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { reservedNames, users } from '../db/schema.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'senha-boa-123';

describe.skipIf(!pgAdminUrl)('nomes de conta (OG-082)', () => {
  let t: TestDatabase;
  let app: App;
  let ip = 0;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    const config = { ...loadConfig({ REGISTER_PER_HOUR: '1000', NAME_FILTER: 'palavrao' }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  const cookieOf = (res: LightMyRequestResponse) => `og_session=${res.cookies.find((c) => c.name === 'og_session')!.value}`;
  const send = (method: 'POST' | 'PUT', url: string, payload: unknown, cookie?: string) =>
    app.inject({
      method,
      url,
      payload: payload as Record<string, unknown>,
      remoteAddress: `10.2.0.${++ip}`,
      headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    });
  const register = (username: string) => send('POST', '/auth/register', { username, email: `${ip + 1}-${Date.now()}@x.com`, password: PASSWORD });
  const check = async (name: string) => (await app.inject(`/names/check?name=${encodeURIComponent(name)}`)).json();

  it('nome com acentos, maiúsculas ou pontuação nas pontas é o mesmo nome', async () => {
    expect((await register('José')).statusCode).toBe(201);
    for (const name of ['JOSE', 'jose', 'Jose!', 'Jösé']) expect((await register(name)).json().error, name).toBe('username_taken');
    expect((await register('Jo Se')).statusCode).toBe(201);
  });

  it('nome proibido (OG-276): cadastro, troca de nome e convidado recusados, sem diferença de maiúsculas e acentos', async () => {
    expect((await register('xXPalavrãoXx')).json().error).toBe('name_not_allowed');
    const cookie = cookieOf(await register('Livre'));
    expect((await send('POST', '/account/username', { username: 'PALAVRAO', password: PASSWORD }, cookie)).json().error).toBe('name_not_allowed');
    const check = (await app.inject({ method: 'GET', url: `/names/check?name=${encodeURIComponent('o palavrão')}` })).json();
    expect(check).toMatchObject({ registrable: false, guestName: null });
  });

  it('nome sem letra nem dígito não pode ser registrado (como no auth.txt)', async () => {
    expect((await register('!!!')).json().error).toBe('invalid_username');
    expect(await check('!!!')).toMatchObject({ valid: true, registrable: false, taken: false, guestName: '!!!*' });
  });

  it('convidado não usa nome registrado; com nome livre aparece com *', async () => {
    expect(await checkGuestName(t.db, 'JOSÉ')).toEqual({ ok: false, reason: 'registered' });
    expect(await checkGuestName(t.db, 'Ana2')).toEqual({ ok: true, name: 'Ana2*' });
    expect(await checkGuestName(t.db, ' Ana')).toEqual({ ok: false, reason: 'invalid' });
    expect(await check('jose')).toEqual({ valid: true, registrable: false, taken: true, guestName: null });
    expect(await check('Ana2')).toEqual({ valid: true, registrable: true, taken: false, guestName: 'Ana2*' });
  });

  it('troca de nome: carência de 30 dias e nome antigo reservado para o dono', async () => {
    const reg = await register('Carla');
    const cookie = cookieOf(reg);
    const changed = await send('POST', '/account/username', { username: 'Carol', password: PASSWORD }, cookie);
    expect(changed.statusCode).toBe(200);
    expect(changed.json().user.username).toBe('Carol');

    // O nome antigo está reservado: ninguém se registra nem joga como convidado com ele.
    expect((await register('carla')).json().error).toBe('username_taken');
    expect((await checkGuestName(t.db, 'Carla')).ok).toBe(false);

    // Grafia do mesmo nome não tem carência.
    expect((await send('POST', '/account/username', { username: 'CAROL', password: PASSWORD }, cookie)).statusCode).toBe(200);
    const again = await send('POST', '/account/username', { username: 'Carolina', password: PASSWORD }, cookie);
    expect(again.statusCode).toBe(429);
    expect(again.json().error).toBe('username_cooldown');

    // Passados 30 dias, o dono pode voltar ao nome reservado; a reserva passa a ser do outro nome.
    const id = reg.json().user.id as string;
    await t.db.update(users).set({ usernameChangedAt: new Date(Date.now() - 31 * 24 * 3600_000) }).where(eq(users.id, id));
    expect((await send('POST', '/account/username', { username: 'Carla', password: PASSWORD }, cookie)).statusCode).toBe(200);
    const reserved = await t.db.select().from(reservedNames).where(eq(reservedNames.userId, id));
    expect(reserved.map((r) => r.nameKey)).toEqual(['carol']);
  });

  it('não troca para nome de outra conta e exige a senha', async () => {
    const cookie = cookieOf(await register('Dario'));
    expect((await send('POST', '/account/username', { username: 'José', password: PASSWORD }, cookie)).statusCode).toBe(409);
    expect((await send('POST', '/account/username', { username: 'Dario2', password: 'errada-000' }, cookie)).statusCode).toBe(403);
    expect((await send('POST', '/account/username', { username: ' Dario', password: PASSWORD }, cookie)).statusCode).toBe(400);
  });

  it('reserva vencida libera o nome', async () => {
    await t.db.update(reservedNames).set({ reservedUntil: new Date(Date.now() - 1000) });
    expect((await register('Carol')).statusCode).toBe(201);
  });

  it('a clan tag livre não existe mais (virou clã, OG-270)', async () => {
    const cookie = cookieOf(await register('Elisa'));
    expect((await send('PUT', '/account/clan-tag', { clanTag: 'BR' }, cookie)).statusCode).toBe(404);
  });
});
