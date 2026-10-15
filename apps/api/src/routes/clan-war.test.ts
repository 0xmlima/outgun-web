// SPDX-License-Identifier: GPL-2.0-or-later
// Clã x clã (OG-259, RN-RKL-14): detecção, marcação na partida, clã de cada jogador e marcos.
import { signInternalRequest } from '@outgun/tickets';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { clanWarSides } from '../clan-war.js';
import { loadConfig } from '../config.js';
import { usernameKey } from '../db/keys.js';
import { migrateUp } from '../db/migrate.js';
import { clanMembers, clans, matches, matchPlayers, playerMilestones, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { backfillMilestones } from '../milestones.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const SECRET = 'segredo-de-teste-0123456789';

describe('detecção (RN-RKL-14)', () => {
  const side = (team: 0 | 1, ...clanIds: (string | null)[]) => clanIds.map((clanId) => ({ team, clanId }));
  it('3 "nn" x 3 "BC" é clã x clã', () => {
    expect(clanWarSides('3x3', [...side(0, 'nn', 'nn', 'nn'), ...side(1, 'BC', 'BC', 'BC')])).toEqual(['nn', 'BC']);
  });
  it('2 "nn" + 1 sem tag x 3 "BC" não é', () => {
    expect(clanWarSides('3x3', [...side(0, 'nn', 'nn', null), ...side(1, 'BC', 'BC', 'BC')])).toBeUndefined();
  });
  it('"nn" x "nn" não é', () => {
    expect(clanWarSides('3x3', [...side(0, 'nn', 'nn', 'nn'), ...side(1, 'nn', 'nn', 'nn')])).toBeUndefined();
  });
  it('lado incompleto ou sem formato não é', () => {
    expect(clanWarSides('4x4', [...side(0, 'nn', 'nn', 'nn'), ...side(1, 'BC', 'BC', 'BC')])).toBeUndefined();
    expect(clanWarSides(null, [...side(0, 'nn', 'nn', 'nn'), ...side(1, 'BC', 'BC', 'BC')])).toBeUndefined();
  });
});

describe.skipIf(!pgAdminUrl)('clã x clã na API (OG-259)', () => {
  let t: TestDatabase;
  let app: App;
  const ids: Record<string, string> = {};
  const clan: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    for (const tag of ['nn', 'BC']) {
      const [c] = await t.db.insert(clans).values({ name: `Clã ${tag}`, nameKey: `cla ${tag.toLowerCase()}`, tag, tagKey: tag.toLowerCase() }).returning({ id: clans.id });
      clan[tag] = c!.id;
      for (let i = 1; i <= 3; i++) {
        const name = `${tag}${i}`;
        const [u] = await t.db.insert(users).values({ username: name, usernameKey: usernameKey(name), email: `${name}@outgun.local`, emailKey: `${name}@outgun.local`, passwordHash: 'x' }).returning({ id: users.id });
        ids[name] = u!.id;
        await t.db.insert(clanMembers).values({ userId: u!.id, clanId: c!.id, role: i === 1 ? 'leader' : 'member' });
      }
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
  const player = (slot: number, name: string, team: 0 | 1, extra: object = {}) => ({
    slot, userId: ids[name], name, team, isBot: false, frags: 0, kills: 0, deaths: 0, captures: 0, playSeconds: 600, scoreDelta: 0, negDelta: 0, stats: {}, ...extra,
  });
  const game = (id: string, redScore: number, blueScore: number, players: ReturnType<typeof player>[]) => ({
    serverMatchId: id, roomId: 'ranked', mode: 'ranked', ranked: true, format: '3x3', map: 'outgun1', redScore, blueScore,
    startedAt: new Date(Date.now() - 600_000).toISOString(), endedAt: new Date().toISOString(), players,
  });
  const lineup = () => [player(0, 'nn1', 0), player(1, 'nn2', 0), player(2, 'nn3', 0), player(3, 'BC1', 1), player(4, 'BC2', 1), player(5, 'BC3', 1)];
  const milestones = async (name: string) => (await t.db.select({ id: playerMilestones.milestone }).from(playerMilestones).where(eq(playerMilestones.userId, ids[name]!))).map((m) => m.id).sort();

  it('marca a partida, guarda o clã de cada jogador e concede os marcos na transação', async () => {
    const res = await internal('/internal/matches', game('w1', 2, 0, lineup()));
    expect(res.statusCode).toBe(201);
    const [m] = await t.db.select().from(matches).where(eq(matches.id, res.json().id));
    expect(m).toMatchObject({ clanWar: true, redClanId: clan.nn, blueClanId: clan.BC });
    const [p] = await t.db.select({ clanId: matchPlayers.clanId }).from(matchPlayers).where(and(eq(matchPlayers.matchId, m!.id), eq(matchPlayers.slot, 3)));
    expect(p!.clanId).toBe(clan.BC);
    expect(await milestones('nn1')).toEqual(expect.arrayContaining(['clan_war', 'clan_war_win', 'clan_defender']));
    expect(await milestones('BC1')).toContain('clan_war');
    expect(await milestones('BC1')).not.toContain('clan_war_win');

    const report = (await app.inject(`/matches/${m!.id}`)).json();
    expect(report.match.clanWar).toBe(true);
    expect(report.clans).toEqual({ red: { tag: 'nn', name: 'Clã nn' }, blue: { tag: 'BC', name: 'Clã BC' } });
  });

  it('bot substituto conta pelo clã do substituído; sem ele, lado incompleto não é clã x clã', async () => {
    const withBot = [...lineup().slice(0, 5), { ...player(5, 'BOT-BC3', 1, { isBot: true, clanId: clan.BC }), userId: undefined }];
    const a = await internal('/internal/matches', game('w2', 1, 1, withBot));
    expect((await t.db.select({ w: matches.clanWar }).from(matches).where(eq(matches.id, a.json().id)))[0]!.w).toBe(true);
    const b = await internal('/internal/matches', game('w3', 1, 1, lineup().slice(0, 5)));
    expect((await t.db.select({ w: matches.clanWar }).from(matches).where(eq(matches.id, b.json().id)))[0]!.w).toBe(false);
  });

  it('o script retroativo concede os mesmos marcos', async () => {
    await t.db.delete(playerMilestones);
    await backfillMilestones(t.db, { beta: false });
    expect(await milestones('nn1')).toEqual(expect.arrayContaining(['clan_war', 'clan_war_win', 'clan_defender']));
  });

  it('estatísticas do clã (OG-273): membro que sai não leva nem apaga os números antigos', async () => {
    const stats = async (tag: string) => (await app.inject(`/clans/${tag}/stats`)).json();
    const before = await stats('nn');
    // w1 2x0 (vitória), w2 1x1 e w3 1x1 (w3 não é clã x clã: lado incompleto)
    expect(before.war).toMatchObject({ matches: 2, wins: 1, draws: 1, losses: 0, capturesFor: 3, capturesAgainst: 1 });
    expect(before.opponents).toEqual([{ tag: 'BC', name: 'Clã BC', matches: 2, wins: 1, losses: 0, draws: 1 }]);
    expect((await stats('BC')).war).toMatchObject({ matches: 2, wins: 0, losses: 1, draws: 1 });
    const nn2 = before.members.find((m: { username: string }) => m.username === 'nn2');
    expect(nn2).toMatchObject({ matches: 3 });

    await t.db.delete(clanMembers).where(eq(clanMembers.userId, ids.nn2!));
    await internal('/internal/matches', game('w4', 0, 1, lineup()));
    const after = await stats('nn');
    expect(after.members.find((m: { username: string }) => m.username === 'nn2')).toEqual(nn2);
    expect(after.war.matches).toBe(2); // sem o nn2, o lado não é mais todo do clã
    expect(after.totals.matches).toBe(4);
  });
});
