// SPDX-License-Identifier: GPL-2.0-or-later
// Rating de habilidade OpenSkill (OG-349, D-65, RN-SKL): os exemplos da proposta à comunidade, quem
// conta numa ranqueada (inclusive quem saiu; bots fora) e o que não conta (Casual, reenvio).
import { signInternalRequest } from '@outgun/tickets';
import { eq } from 'drizzle-orm';
import { rate, rating } from 'openskill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { usernameKey } from '../db/keys.js';
import { migrateUp } from '../db/migrate.js';
import { playerSkill, skillChanges, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { skillValue } from '../skill.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const SECRET = 'segredo-de-teste-0123456789';

describe('valor exibido e exemplos da proposta (RN-SKL-04)', () => {
  const coiote = { mu: 32, sigma: 2.5 };
  const medio = { mu: 25, sigma: 3 };
  const slim = { mu: 22, sigma: 3 };
  const values = (teams: { mu: number; sigma: number }[][]) => teams.map((t) => t.map(skillValue));

  it('(μ − 3σ) × 100, nunca abaixo de 0; conta nova começa em 0', () => {
    expect(skillValue(medio)).toBe(1600);
    expect(skillValue(rating())).toBe(0);
    expect(skillValue({ mu: 18, sigma: 7 })).toBe(0);
  });

  it('3x3: favorito vence, zebra e empate', () => {
    const teams = [[coiote, medio, medio], [slim, medio, medio]];
    expect(values(rate(teams, { rank: [1, 2] }))).toEqual([[2469, 1629, 1629], [1280, 1580, 1580]]);
    expect(values(rate(teams, { rank: [2, 1] }))).toEqual([[2402, 1532, 1532], [1377, 1677, 1677]]);
    expect(values(rate(teams, { rank: [1, 1] }))).toEqual([[2436, 1581, 1581], [1329, 1629, 1629]]);
  });

  it('novato muda mais; time com um a menos que vence ganha mais', () => {
    expect(values(rate([[rating(), medio, medio], [medio, medio, medio]], { rank: [1, 2] }))[0]).toEqual([398, 1642, 1642]);
    expect(values(rate([[medio, medio, medio], [medio, medio]], { rank: [2, 1] }))[1]).toEqual([1696, 1696]);
  });
});

describe.skipIf(!pgAdminUrl)('rating de habilidade nas ranqueadas (OG-349)', () => {
  let t: TestDatabase;
  let app: App;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    for (const name of ['Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fabi']) {
      const [u] = await t.db.insert(users).values({ username: name, usernameKey: usernameKey(name), email: `${name}@outgun.local`, emailKey: `${name}@outgun.local`, passwordHash: 'x' }).returning({ id: users.id });
      ids[name] = u!.id;
    }
    const config = { ...loadConfig({ INTERNAL_SECRETS: `gs-1:${SECRET}` }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  const internal = (url: string, payload: unknown) => {
    const body = JSON.stringify(payload);
    return app.inject({ method: 'POST', url, payload: body, headers: { 'content-type': 'application/json', ...signInternalRequest('gs-1', SECRET, 'POST', url, body) } });
  };
  const player = (slot: number, name: string, team: 0 | 1, isBot = false) => ({
    slot, ...(isBot ? {} : { userId: ids[name] }), name, team, isBot, frags: 0, kills: 0, deaths: 0, captures: 0, playSeconds: 600, scoreDelta: 0, negDelta: 0, stats: {},
  });
  const match = (id: string, redScore: number, blueScore: number, players: ReturnType<typeof player>[], extra: Record<string, unknown> = {}) => ({
    serverMatchId: id, roomId: 'ranked', mode: 'ranked', ranked: true, map: 'outgun1', redScore, blueScore, format: '3x3',
    startedAt: new Date(Date.now() - 600_000).toISOString(), endedAt: new Date().toISOString(), players, ...extra,
  });
  const skillOf = async (name: string) => (await t.db.select().from(playerSkill).where(eq(playerSkill.userId, ids[name]!)))[0];
  const changesOf = async (matchId: string) => t.db.select().from(skillChanges).where(eq(skillChanges.matchId, matchId));

  it('vitória atualiza os dois lados; reenvio não aplica de novo', async () => {
    const body = match('m1', 2, 1, [player(0, 'Ana', 0), player(1, 'Bia', 1), player(2, 'Caio', 0), player(3, 'Duda', 1)]);
    const first = await internal('/internal/matches', body);
    expect(first.statusCode).toBe(201);
    expect((await internal('/internal/matches', body)).statusCode).toBe(200);
    const ana = (await skillOf('Ana'))!;
    const bia = (await skillOf('Bia'))!;
    expect(ana.matches).toBe(1);
    expect(ana.mu).toBeGreaterThan(25);
    expect(bia.mu).toBeLessThan(25);
    const changes = await changesOf(first.json().id);
    expect(changes).toHaveLength(4);
    expect(changes.every((c) => c.winChance > 0.49 && c.winChance < 0.51)).toBe(true);
  });

  it('empate: o favorito perde um pouco e o azarão ganha', async () => {
    const before = { ana: (await skillOf('Ana'))!.mu, bia: (await skillOf('Bia'))!.mu };
    expect((await internal('/internal/matches', match('m2', 1, 1, [player(0, 'Ana', 0), player(1, 'Bia', 1)]))).statusCode).toBe(201);
    expect((await skillOf('Ana'))!.mu).toBeLessThan(before.ana);
    expect((await skillOf('Bia'))!.mu).toBeGreaterThan(before.bia);
  });

  it('quem saiu no meio recebe o resultado; bot substituto fica fora', async () => {
    // Edu saiu (está só no roster); o bot ficou no lugar dele no time azul
    const body = match('m3', 3, 0, [player(0, 'Fabi', 0), player(1, 'BOT-Edu', 1, true)], {
      substitutions: [{ kind: 'bot', team: 1, atSeconds: 120 }],
      skillRoster: [{ userId: ids.Fabi, team: 0 }, { userId: ids.Edu, team: 1 }],
    });
    const res = await internal('/internal/matches', body);
    expect(res.statusCode).toBe(201);
    expect((await skillOf('Edu'))!.mu).toBeLessThan(25);
    expect((await skillOf('Fabi'))!.mu).toBeGreaterThan(25);
    expect((await changesOf(res.json().id)).map((c) => c.userId).sort()).toEqual([ids.Edu, ids.Fabi].sort());
  });

  it('Casual e partida com conta de um lado só não mudam o rating', async () => {
    const casual = { ...match('m4', 1, 0, [player(0, 'Duda', 0), player(1, 'Caio', 1)]), mode: 'casual', ranked: false, roomId: 'main' };
    delete (casual as { format?: string }).format;
    expect((await internal('/internal/matches', casual)).statusCode).toBe(201);
    const oneSide = await internal('/internal/matches', match('m5', 1, 0, [player(0, 'Duda', 0), player(1, 'BOT-x', 1, true)], { substitutions: [{ kind: 'bot', team: 1, atSeconds: 60 }] }));
    expect(oneSide.statusCode).toBe(201);
    expect((await skillOf('Duda'))!.matches).toBe(1);
    expect(await changesOf(oneSide.json().id)).toEqual([]);
  });

  it('perfil e partida mostram o rating e a variação', async () => {
    const profile = (await app.inject('/players/Fabi')).json();
    expect(profile.skill).toMatchObject({ matches: 1, calibrating: true });
    expect(profile.skill.value).toBe(skillValue(profile.skill));
    expect((await app.inject('/players/Jogador1')).json().skill).toBeNull();
    const [m3] = await t.db.select({ matchId: skillChanges.matchId }).from(skillChanges).where(eq(skillChanges.userId, ids.Edu!));
    const detail = (await app.inject(`/matches/${m3!.matchId}`)).json();
    expect(detail.skill.map((s: { username: string }) => s.username).sort()).toEqual(['Edu', 'Fabi']);
  });
});
