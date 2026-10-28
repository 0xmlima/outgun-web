// SPDX-License-Identifier: GPL-2.0-or-later
// Radar de estilo (OG-469, RN-RAD): rota do perfil com eixos, bots e Casual fora, formato,
// temporada anterior e "desde DD/MM" dos eixos com contadores novos.
import { signInternalRequest } from '@outgun/tickets';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { usernameKey } from '../db/keys.js';
import { migrateUp } from '../db/migrate.js';
import { eq } from 'drizzle-orm';
import { clanMembers, clans, rooms, seasons, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { clearStyleCache } from '../style-radar.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const SECRET = 'segredo-de-teste-0123456789';
const DAY = 86_400_000;

describe.skipIf(!pgAdminUrl)('radar de estilo (OG-469)', () => {
  let t: TestDatabase;
  let app: App;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    await t.db.insert(seasons).values({ name: 'Temporada passada', startsAt: new Date(Date.now() - 400 * DAY), endsAt: new Date(Date.now() - 370 * DAY), active: false });
    await t.db.insert(rooms).values({ id: 'r3', name: 'Ranked 3x3', mode: 'ranked', preset: 'ranked', maxPlayers: 6, format: '3x3', bestOf: 1 });
    for (const name of ['Ana', 'Bia', 'Caio', 'Davi', 'Eli']) {
      const [u] = await t.db.insert(users).values({ username: name, usernameKey: usernameKey(name), email: `${name}@outgun.local`, emailKey: `${name}@outgun.local`, passwordHash: 'x' }).returning({ id: users.id });
      ids[name] = u!.id;
    }
    const config = { ...loadConfig({ INTERNAL_SECRETS: `gs-1:${SECRET}` }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });

    let n = 0;
    const send = async (players: object[], ranked = true, format?: '3x3') => {
      const body = JSON.stringify({
        serverMatchId: `m${++n}`, roomId: ranked ? (format ? 'r3' : 'ranked') : 'main', mode: ranked ? 'ranked' : 'casual', ranked, map: 'outgun1', redScore: 1, blueScore: 0,
        startedAt: new Date(Date.now() - 600_000).toISOString(), endedAt: new Date().toISOString(), players, ...(format ? { format } : {}),
      });
      const res = await app.inject({ method: 'POST', url: '/internal/matches', payload: body, headers: { 'content-type': 'application/json', ...signInternalRequest('gs-1', SECRET, 'POST', '/internal/matches', body) } });
      expect(res.statusCode).toBe(201);
    };
    const line = (slot: number, name: string, team: 0 | 1, kills: number, deaths: number, stats: Record<string, number>, isBot = false) => ({
      slot, userId: isBot ? null : ids[name], name, team, isBot, frags: kills, kills, deaths, captures: stats.captures ?? 0, playSeconds: 600, scoreDelta: 0, negDelta: 0, stats,
    });
    // Ana: atiradora, 5 ranqueadas 3x3; Bia: corredora, 5 sem formato; Caio: 3 (radar com poucos jogos, fora da base); Davi: 2 (sem radar)
    for (let i = 0; i < 5; i++) {
      await send(
        [
          line(0, 'Ana', 0, 9, 3, { botKills: 3, hits: 30, shots: 60, lifetime: 400, assists: 1, defenses: 1 }),
          line(1, 'Robô', 1, 50, 0, { hits: 99, shots: 99 }, true),
        ],
        true,
        '3x3',
      );
      await send([line(0, 'Bia', 1, 1, 5, { hits: 5, shots: 50, lifetime: 200, flagsTaken: 3, captures: 2, flagsReturned: 1, trades: 1 })]);
    }
    for (let i = 0; i < 3; i++) await send([line(0, 'Caio', 0, 2, 1, { hits: 10, shots: 40, lifetime: 300 })]);
    for (let i = 0; i < 2; i++) await send([line(0, 'Davi', 0, 2, 1, { hits: 10, shots: 40, lifetime: 300 })]);
    // Casual não conta
    await send([line(0, 'Bia', 1, 100, 0, { hits: 100, shots: 100 })], false);
    // Eli: uma ranqueada de 1 minuto (abandono), curta demais para o radar da partida
    await send([{ ...line(0, 'Eli', 0, 1, 0, { hits: 1, shots: 1 }), playSeconds: 60 }]);
  });
  beforeEach(() => clearStyleCache());
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  type Axis = { axis: string; percentile: number; value: number };
  const style = async (name: string, q = '') => (await app.inject(`/players/${name}/style?${q}`)).json();
  const axes = (r: { radar: { axes: Axis[] } }) => Object.fromEntries(r.radar.axes.map((a) => [a.axis, [a.percentile, Number(a.value.toFixed(3))]]));

  it('6 eixos em ordem fixa, com percentil e valor bruto; abates em bot e Casual fora', async () => {
    const ana = await style('Ana');
    expect(ana.radar.axes.map((a: Axis) => a.axis)).toEqual(['kills', 'accuracy', 'survival', 'flag', 'defense', 'team']);
    // Ana: (9 − 3) por 10 min, 30/60, 2000 s / (15 mortes + 5), 0, (0 + 0 + 1), (1 + 0); só Bia na base
    expect(axes(ana)).toEqual({ kills: [100, 6], accuracy: [100, 0.5], survival: [100, 100], flag: [0, 0], defense: [50, 1], team: [50, 1] });
    expect(ana.radar).toMatchObject({ games: 5, lowSample: true, archetype: 'shooter', population: 2 });
    // Bia: (3 + 3 × 2) por 10 min; a Casual de 100 abates não entra
    expect(axes(await style('Bia'))).toMatchObject({ kills: [0, 1], flag: [100, 9], defense: [50, 1] });
    expect((await style('Bia')).radar.archetype).toBe('runner');
  });

  it('amostra: 3 a 4 partidas têm radar fora da base; abaixo de 3, sem radar nem arquétipo', async () => {
    const caio = await style('Caio');
    expect(caio.radar).toMatchObject({ games: 3, lowSample: true, population: 2 });
    expect(caio.radar.axes).toHaveLength(6);
    expect((await style('Davi')).radar).toMatchObject({ games: 2, axes: null, archetype: null });
  });

  it('filtro de formato e "sempre"', async () => {
    const ana = await style('Ana', 'format=3x3');
    expect(ana.radar.population).toBe(1); // sozinha no 3x3
    expect(axes(ana).kills).toEqual([100, 6]);
    expect((await style('Bia', 'format=3x3')).radar).toMatchObject({ games: 0, axes: null });
    const always = await style('Ana', 'overall=true');
    expect(always.season).toBeNull();
    expect(always.previous).toBeNull();
    expect(always.radar.games).toBe(5);
  });

  it('temporada anterior para o tracejado e "desde" dos contadores novos', async () => {
    const ana = await style('Ana');
    expect(ana.previous.season.name).toBe('Temporada passada');
    expect(ana.previous.radar).toMatchObject({ games: 0, axes: null });
    expect(ana.since.defense).not.toBeNull();
    expect(ana.since.team).not.toBeNull();
  });

  it('sombra de referência (OG-476): top 10 com quem houver; sem clã, nada', async () => {
    const top = await style('Caio', 'reference=top10');
    expect(top.reference).toMatchObject({ kind: 'top10', members: 2 }); // só Ana e Bia têm o mínimo
    expect(top.reference.axes.find((a: Axis) => a.axis === 'kills').percentile).toBe(50); // 100 e 0
    const none = await style('Ana', 'reference=clan');
    expect(none.clanTag).toBeNull();
    expect(none.reference).toBeNull();
  });

  it('radar da partida (OG-475): eixos da partida contra a temporada, sem bots; curta demais; Casual sem radar', async () => {
    const matchOf = async (name: string, ranked: boolean) =>
      (await t.sql`SELECT m.id FROM matches m JOIN match_players mp ON mp.match_id = m.id WHERE mp.user_id = ${ids[name]!} AND m.ranked = ${ranked} LIMIT 1`)[0]!.id as string;
    const style = async (id: string) => (await app.inject(`/matches/${id}/style`)).json();
    const ana = await style(await matchOf('Ana', true));
    expect(ana.ranked).toBe(true);
    expect(ana.players).toHaveLength(1); // o Robô não entra
    expect(ana.players[0]).toMatchObject({ username: 'Ana', short: false, season: { games: 5 } });
    expect(ana.players[0].match.find((a: Axis) => a.axis === 'kills')).toEqual({ axis: 'kills', percentile: 100, value: 6 });
    expect((await style(await matchOf('Eli', true))).players[0]).toMatchObject({ username: 'Eli', short: true, match: null, season: { axes: null } });
    expect(await style(await matchOf('Bia', false))).toMatchObject({ ranked: false, players: [] });
  });

  it('404 para quem não existe', async () => {
    expect((await app.inject('/players/Ninguem/style')).statusCode).toBe(404);
  });
});

describe.skipIf(!pgAdminUrl)('radar do clã (OG-473)', () => {
  let t: TestDatabase;
  let app: App;
  const ids: Record<string, string> = {};
  const clanIds: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    for (const tag of ['AAA', 'BBB']) {
      const [c] = await t.db.insert(clans).values({ name: `Clã ${tag}`, nameKey: `cla ${tag.toLowerCase()}`, tag, tagKey: tag.toLowerCase() }).returning({ id: clans.id });
      clanIds[tag] = c!.id;
    }
    for (const name of ['Ana', 'Bia', 'Caio', 'Eva', 'Gil']) {
      const [u] = await t.db.insert(users).values({ username: name, usernameKey: usernameKey(name), email: `${name}@outgun.local`, emailKey: `${name}@outgun.local`, passwordHash: 'x' }).returning({ id: users.id });
      ids[name] = u!.id;
      if (name !== 'Gil') await t.db.insert(clanMembers).values({ userId: u!.id, clanId: clanIds.AAA!, role: name === 'Ana' ? 'leader' : 'member' });
    }
    const config = { ...loadConfig({ INTERNAL_SECRETS: `gs-1:${SECRET}` }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
    let n = 0;
    const play = async (name: string, kills: number, times: number) => {
      for (let i = 0; i < times; i++) {
        const players = [{ slot: 0, userId: ids[name], name, team: 0, isBot: false, frags: kills, kills, deaths: 1, captures: 0, playSeconds: 600, scoreDelta: 0, negDelta: 0, stats: { hits: 1, shots: 2, lifetime: 100 } }];
        const body = JSON.stringify({ serverMatchId: `c${++n}`, roomId: 'ranked', mode: 'ranked', ranked: true, map: 'outgun1', redScore: 1, blueScore: 0, startedAt: new Date(Date.now() - 600_000).toISOString(), endedAt: new Date().toISOString(), players });
        const res = await app.inject({ method: 'POST', url: '/internal/matches', payload: body, headers: { 'content-type': 'application/json', ...signInternalRequest('gs-1', SECRET, 'POST', '/internal/matches', body) } });
        expect(res.statusCode).toBe(201);
      }
    };
    await play('Ana', 9, 5);
    await play('Bia', 3, 5);
    await play('Caio', 5, 2); // abaixo de 3 pelo clã: fora da mediana
    await play('Gil', 6, 5); // sem clã: só a base do percentil
    await play('Eva', 20, 3); // pelo AAA...
    await t.db.update(clanMembers).set({ clanId: clanIds.BBB! }).where(eq(clanMembers.userId, ids.Eva!));
    await play('Eva', 0, 3); // ...e depois pelo BBB
  });
  beforeEach(() => clearStyleCache());
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  const clan = async (tag: string) => (await app.inject(`/clans/${tag}/style`)).json();
  const kills = (axes: { axis: string; percentile: number }[]) => axes.find((a) => a.axis === 'kills')!.percentile;

  it('mediana dos membros atuais com radar; poucas partidas pelo clã fica fora', async () => {
    const a = await clan('AAA');
    // base: Ana 9, Bia 3, Gil 6, Eva 10 por 10 min; Ana = 67, Bia = 0 → mediana 33,5
    expect(kills(a.clan.axes)).toBe(34);
    expect(a.clan.members).toBe(2);
    expect(a.members.map((m: { username: string }) => m.username)).toEqual(['Ana', 'Bia', 'Caio']); // Eva saiu
    expect(a.members.find((m: { username: string }) => m.username === 'Caio').radar).toMatchObject({ games: 2, axes: null });
  });

  it('quem saiu não leva os números antigos para o clã novo (RN-CLA-06)', async () => {
    const b = await clan('BBB');
    expect(b.members).toHaveLength(1);
    expect(b.members[0].radar.games).toBe(3);
    expect(kills(b.clan.axes)).toBe(0); // só as 3 de 0 abates pelo BBB
    expect((await app.inject('/clans/ZZZ/style')).statusCode).toBe(404);
  });

  it('prévia do confronto: mediana de quem está escalado, e muda com a escalação (OG-474)', async () => {
    const lineup = async (q: string) => (await app.inject(`/style/lineup?${q}`)).json();
    const both = await lineup('red=Ana,Bia&redClan=AAA&blue=Gil');
    expect(both.sides[0]).toMatchObject({ clan: 'AAA', median: { members: 2 } });
    expect(kills(both.sides[0].median.axes)).toBe(34);
    expect(both.sides[1].clan).toBeNull();
    expect(both.sides[1].players[0]).toMatchObject({ username: 'Gil', radar: { games: 5 } });
    const swapped = await lineup('red=Ana,Caio&redClan=AAA&blue=Gil');
    expect(kills(swapped.sides[0].median.axes)).toBe(67); // Caio não tem radar: só a Ana
    expect(swapped.sides[0].players.map((p: { username: string }) => p.username)).toEqual(['Ana', 'Caio']);
    // escalada por um clã de que já saiu: sem radar
    expect((await lineup('red=Eva&redClan=AAA&blue=')).sides[0]).toMatchObject({ median: null, players: [{ username: 'Eva', radar: { axes: null } }] });
  });

  it('sombra do clã no perfil (OG-476): a mediana do clã atual', async () => {
    const r = (await app.inject('/players/Bia/style?reference=clan')).json();
    expect(r.reference).toMatchObject({ kind: 'clan', members: 2 });
    expect(kills(r.reference.axes)).toBe(34);
  });

  it('contra um rival com poucas partidas: "poucos jogos" (OG-474, RN-RAD-03)', async () => {
    const r = (await app.inject('/clans/AAA/style?against=BBB')).json();
    expect(r).toMatchObject({ matches: 0, lowSample: true, clan: null });
    expect((await clan('AAA')).lowSample).toBe(false);
  });
});
