// SPDX-License-Identifier: GPL-2.0-or-later
// Sala de treino pela API (OG-492, D-86/D-87, RN-TRN-06): mapas de treino, opções no spawn do servidor e
// uma sala de treino aberta por conta.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { rooms } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { roomSpawn } from '../registry.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';

describe.skipIf(!pgAdminUrl)('sala de treino (OG-492)', () => {
  let t: TestDatabase;
  let app: App;
  let cookie: string;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    app = await buildApp({ config: { ...loadConfig({}), databaseUrl: t.url }, database: t, mailer: new MemoryMailer(), logger: false });
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'Jogador1', password: 'outgun-dev' }, headers: { origin: ORIGIN } });
    cookie = `og_session=${login.cookies.find((c) => c.name === 'og_session')!.value}`;
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  const create = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/rooms', payload: { name: 'Treino', preset: 'classic', ...payload }, headers: { origin: ORIGIN, cookie } });
  const training = (mode: string, extra: Record<string, unknown> = {}) => ({ mode, bots: 2, allies: 2, level: 0, powerups: false, sameStart: true, ...extra });

  it('cria cada modo num mapa de treino, com as opções no limite do modo', async () => {
    for (const mode of ['attack', 'defense', 'escape', 'capture']) {
      await t.db.delete(rooms).where(eq(rooms.name, 'Treino'));
      const res = await create({ maps: ['cebs park'], training: training(mode, { bots: 5 }) });
      expect(res.statusCode).toBe(201);
      expect(res.json().room).toMatchObject({ training: mode, maxPlayers: 16 });
      const [row] = await t.db.select().from(rooms).where(eq(rooms.id, res.json().room.id));
      const spawn = roomSpawn(row!);
      expect(spawn.maps).toEqual(['cebs park']);
      expect(spawn.casualBots).toBeUndefined();
      // limites do modo (RN-TRN-04): defensores 1–4, atacantes 1–5, perseguidores 1–4, escolta 0–3; aliados só na Defesa
      expect(spawn.training).toEqual({ mode, bots: { attack: 4, defense: 5, escape: 4, capture: 3 }[mode], allies: mode === 'defense' ? 2 : 0, level: 0, powerups: false, sameStart: true });
    }
  });

  it('só os mapas de treino, um por sala', async () => {
    await t.db.delete(rooms).where(eq(rooms.name, 'Treino'));
    expect((await create({ maps: ['outgun1'], training: training('attack') })).json().error).toBe('invalid_training_map');
    expect((await create({ maps: ['pari2', 'the cover 4'], training: training('attack') })).json().error).toBe('invalid_training_map');
    expect((await create({ training: training('attack') })).json().error).toBe('invalid_training_map');
  });

  it('uma sala de treino aberta por conta: a fora do ar dá lugar à nova; com uma no ar, recusa', async () => {
    await t.db.delete(rooms).where(eq(rooms.name, 'Treino'));
    const first = (await create({ maps: ['pari2'], training: training('escape') })).json().room.id as string;
    const second = await create({ maps: ['pari2'], training: training('capture') });
    expect(second.statusCode).toBe(201);
    expect(await t.db.select().from(rooms).where(eq(rooms.id, first))).toHaveLength(0);
    await t.db.update(rooms).set({ lastHeartbeatAt: new Date() }).where(eq(rooms.id, second.json().room.id));
    const third = await create({ maps: ['pari2'], training: training('attack') });
    expect(third.statusCode).toBe(409);
    expect(third.json().error).toBe('training_room_open');
    // sala comum não conta para o limite
    expect((await create({ name: 'Comum' })).statusCode).toBe(201);
  });
});
