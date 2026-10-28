// SPDX-License-Identifier: GPL-2.0-or-later
// Partidas de mentira no banco LOCAL para conferir relatórios, PDFs e emblemas (S51): contas
// (senha "outgun-dev"), clãs com cores e emblema, e partidas Casual e Ranked (séries clã x clã)
// mandadas pela rota interna `POST /internal/matches`, assinadas como o game server: a API grava
// tudo como numa partida real (ranking, série, guerra de clãs, eventos). Idempotente.
// Uso (depois de `pnpm --filter @outgun/api build`, com o Postgres do `dev:all` no ar):
//   node tools/dev/fake-matches.mjs [usuário]   (padrão: ozzylords)
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const api = (p) => import(pathToFileURL(join(root, 'apps/api/dist', p)).href);
const requireApi = createRequire(join(root, 'apps/api/package.json'));
const imp = async (name) => import(pathToFileURL(requireApi.resolve(name)).href);

const { buildApp } = await api('app.js');
const { loadConfig } = await api('config.js');
const { connect } = await api('db/client.js');
const { clanKey, emailKey, usernameKey } = await api('db/keys.js');
const { clanMembers, clans, playerProfiles, users } = await api('db/schema.js');
const { hash } = await imp('@node-rs/argon2');
const { and, eq } = await imp('drizzle-orm');
const { CLAN_COLORS: C, colourDistance, DEFAULT_EMBLEM, emblemKey } = await imp('@outgun/protocol');
const { signInternalRequest } = await imp('@outgun/tickets');

const config = loadConfig(process.env);
if (!/localhost|127\.0\.0\.1/.test(config.databaseUrl))
  throw new Error(`só no banco local (DATABASE_URL = ${config.databaseUrl})`);
const database = connect(config.databaseUrl);
const { db } = database;
const app = await buildApp({ config, database, logger: false });
await app.ready();
const [serverId, [secret]] = [...config.internalSecrets][0];

const ME = process.argv[2] ?? 'ozzylords';
const PASSWORD = await hash('outgun-dev');

// --- contas e clãs ---
const CLANS = [
  {
    tag: 'LC',
    name: 'Lobos do Cerrado',
    primary: C.navy,
    secondary: C.yellow,
    emblem: { frame: 'shield', symbol: 'wolf', fillet: true, inverted: false },
    members: ['PedroK', 'manu_cap', 'LeoTorres', 'bia_snipe'],
  },
  {
    tag: 'MV',
    name: 'Maré Vermelha',
    primary: C.wine,
    secondary: C.white,
    emblem: { frame: 'circle', symbol: 'tag', fillet: false, inverted: false },
    members: ['zeca_mv', 'GuiRocha', 'Lari_Ninja'],
  },
  {
    tag: 'BDL',
    name: 'Bando da Laje',
    primary: C.orange,
    secondary: C.black,
    emblem: { frame: 'banner', symbol: 'skull', fillet: false, inverted: false },
    members: ['Tonhao', 'Juju_BDL', 'Fabinho', 'Kleber_77'],
  },
];
const MY_CLAN_EXTRA = ['kaiofps', 'Renata_BR', 'dudu_rocket'];
const LONERS = ['Joana_Fly', 'MarceloT', 'Vini_Cap'];

async function account(username) {
  const [found] = await db
    .select()
    .from(users)
    .where(eq(users.usernameKey, usernameKey(username)));
  if (found) return found;
  const email = `${username.toLowerCase()}@fake.outgun.local`;
  const [row] = await db
    .insert(users)
    .values({
      username,
      usernameKey: usernameKey(username),
      email,
      emailKey: emailKey(email),
      passwordHash: PASSWORD,
    })
    .returning();
  await db.insert(playerProfiles).values({ userId: row.id }).onConflictDoNothing();
  return row;
}

async function clanWith(c, leader, members) {
  let [clan] = await db
    .select()
    .from(clans)
    .where(eq(clans.tagKey, clanKey(c.tag)));
  if (!clan) {
    const key = emblemKey(c.emblem, c.tag, c.primary, c.secondary);
    [clan] = await db
      .insert(clans)
      .values({
        name: c.name,
        nameKey: clanKey(c.name),
        tag: c.tag,
        tagKey: clanKey(c.tag),
        primaryColor: c.primary,
        secondaryColor: c.secondary,
        emblem: c.emblem,
        emblemKey: key,
      })
      .returning();
  }
  for (const [i, u] of [leader, ...members].entries()) {
    const [m] = await db.select().from(clanMembers).where(eq(clanMembers.userId, u.id));
    if (!m)
      await db
        .insert(clanMembers)
        .values({
          clanId: clan.id,
          userId: u.id,
          role: i === 0 ? 'leader' : i === 1 ? 'admin' : 'member',
        });
  }
  return clan;
}

const me = await account(ME);
const [myMembership] = await db.select().from(clanMembers).where(eq(clanMembers.userId, me.id));
if (!myMembership)
  throw new Error(`${ME} precisa estar num clã com cores (crie pelo portal antes)`);
let [myClan] = await db.select().from(clans).where(eq(clans.id, myMembership.clanId));
if (!myClan.primaryColor) {
  await db
    .update(clans)
    .set({ primaryColor: C.black, secondaryColor: C.yellow })
    .where(eq(clans.id, myClan.id));
  [myClan] = await db.select().from(clans).where(eq(clans.id, myClan.id));
}
const mine = [me];
for (const n of MY_CLAN_EXTRA) {
  const u = await account(n);
  const [m] = await db.select().from(clanMembers).where(eq(clanMembers.userId, u.id));
  if (!m) await db.insert(clanMembers).values({ clanId: myClan.id, userId: u.id, role: 'member' });
  mine.push(u);
}
const rivals = {};
for (const c of CLANS) {
  const people = [];
  for (const n of c.members) people.push(await account(n));
  rivals[c.tag] = { clan: await clanWith(c, people[0], people.slice(1)), people };
}
const loners = [];
for (const n of LONERS) loners.push(await account(n));

// --- partidas ---
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const MAPS = [
  ['coliseu', 'Coliseu'],
  ['ipiranga', 'Ipiranga'],
  ['mooca', 'Mooca'],
  ['pari', 'Pari'],
  ['verde', 'Verde'],
  ['outgun1', 'The Blunt'],
];

/** Lado que virou o clã como o game server manda (`teams` do relatório, OG-409/485). */
function side(clan, other) {
  if (!clan) return null;
  const far = (a, b) => colourDistance(a, b) >= 22;
  const color =
    !other || far(clan.primaryColor, other)
      ? clan.primaryColor
      : far(clan.secondaryColor, other)
        ? clan.secondaryColor
        : null;
  return {
    tag: clan.tag,
    name: clan.name,
    color,
    emblem: clan.emblem ?? DEFAULT_EMBLEM,
    colors: { primary: clan.primaryColor, secondary: clan.secondaryColor },
  };
}

function match({
  id,
  ranked,
  format,
  map,
  red,
  blue,
  redScore,
  blueScore,
  endedAt,
  series,
  redClan,
  blueClan,
  minutes = 8,
}) {
  const [mapId, mapTitle] = map;
  const seconds = minutes * 60;
  const players = [];
  const roster = [...red.map((p) => [p, 0]), ...blue.map((p) => [p, 1])];
  roster.forEach(([p, team], i) => {
    const kills = int(2, 16);
    const deaths = int(3, 14);
    const suicides = int(0, 2);
    const shots = int(60, 220);
    players.push({
      slot: team === 0 ? i : 8 + i - red.length,
      ...(p.id ? { userId: p.id } : {}),
      name: p.username ?? p.name,
      team,
      isBot: !p.id,
      frags: kills - suicides,
      kills,
      deaths,
      captures: 0,
      playSeconds: seconds - int(0, 40),
      scoreDelta: 0,
      negDelta: 0,
      stats: {
        shots,
        hits: Math.round(shots * (0.15 + rnd() * 0.25)),
        assists: int(0, 6),
        defenses: int(0, 5),
        suicides,
        trades: int(0, 3),
        flagsTaken: int(0, 4),
        flagsDropped: int(0, 3),
        flagsReturned: int(0, 4),
        carriersKilled: int(0, 4),
        firstKills: int(0, 2),
        multiKills: int(0, 2),
        killsOwnBase: int(0, 5),
        killsMidfield: int(0, 6),
        killsEnemyBase: int(0, 4),
        flagCarryingTime: int(0, 90),
        effectiveDamage: int(200, 1600),
        shotsTaken: int(40, 200),
        movement: int(4000, 16000),
        consecutiveKills: int(1, 6),
        consecutiveDeaths: int(1, 4),
        botKills: 0,
      },
    });
  });
  for (const p of players) p.stats.accuracy = p.stats.hits / p.stats.shots;
  // capturas: cada ponto do lado vai para alguém do lado, em ordem de tempo
  const captures = [];
  for (const [team, score] of [
    [0, redScore],
    [1, blueScore],
  ])
    for (let k = 0; k < score; k++) {
      const side = players.filter((p) => p.team === team);
      const who = side[int(0, side.length - 1)];
      const helper = rnd() < 0.6 ? side.find((p) => p !== who) : undefined;
      who.captures++;
      who.stats.flagsTaken++;
      captures.push({
        time: int(30, seconds - 10),
        team,
        capturer: who.name,
        assistant: helper?.name ?? null,
      });
    }
  captures.sort((a, b) => a.time - b.time);
  for (const p of players) p.frags += 5 * p.captures;
  const sum = (team, f) => players.filter((p) => p.team === team).reduce((s, p) => s + f(p), 0);
  const teamStats = [0, 1].map((team) => ({
    score: team === 0 ? redScore : blueScore,
    kills: sum(team, (p) => p.kills),
    deaths: sum(team, (p) => p.deaths),
    suicides: sum(team, (p) => p.stats.suicides),
    flagsTaken: sum(team, (p) => p.stats.flagsTaken),
    flagsDropped: sum(team, (p) => p.stats.flagsDropped),
    flagsReturned: sum(team, (p) => p.stats.flagsReturned),
    shots: sum(team, (p) => p.stats.shots),
    accuracy:
      sum(team, (p) => p.stats.hits) /
      Math.max(
        1,
        sum(team, (p) => p.stats.shots),
      ),
    shotsTaken: sum(team, (p) => p.stats.shotsTaken),
    movement: sum(team, (p) => p.stats.movement),
  }));
  const started = new Date(endedAt.getTime() - seconds * 1000);
  const body = {
    serverMatchId: id,
    roomId: ranked ? 'ranked' : 'main',
    mode: ranked ? 'ranked' : 'casual',
    ranked,
    map: mapId,
    redScore,
    blueScore,
    startedAt: started.toISOString(),
    endedAt: endedAt.toISOString(),
    ...(format ? { format } : {}),
    details: {
      reason: Math.max(redScore, blueScore) >= 5 ? 'captureLimit' : 'timeLimit',
      mapTime: seconds,
      mapTitle,
      rules: {
        captureLimit: 5,
        winScoreDifference: 1,
        timeLimit: seconds,
        extraTime: 0,
        extraTimePeriods: 1,
        suddenDeath: false,
      },
      teams: teamStats,
      captures,
      baseScore: [0, 0],
    },
    ...(series ? { series } : {}),
    players,
    teams: [side(redClan, null), side(blueClan, redClan?.primaryColor)],
  };
  // eventos da ranqueada (OG-362): os abates de cada um e as bandeiras das capturas
  if (ranked) {
    const events = [];
    players.forEach((p, i) => {
      const foes = players.map((q, j) => [q, j]).filter(([q]) => q.team !== p.team);
      for (let k = 0; k < p.kills; k++)
        events.push([
          int(5, seconds - 5),
          'kill',
          i,
          foes[int(0, foes.length - 1)][1],
          int(0, 3),
          int(0, 2),
          rnd() < 0.15 ? 1 : 0,
          'gun',
        ]);
    });
    for (const c of captures) {
      const who = players.findIndex((p) => p.name === c.capturer);
      events.push(
        [Math.max(0, c.time - int(8, 25)), 'take', who, 1 - c.team],
        [c.time, 'capture', who, 1 - c.team],
      );
    }
    events.sort((a, b) => a[0] - b[0]);
    body.events = {
      players: players.map((p) => ({
        slot: p.slot,
        ...(p.userId ? { userId: p.userId } : {}),
        name: p.name,
        team: p.team,
        bot: p.isBot,
      })),
      events,
    };
  }
  return body;
}

async function post(body) {
  const payload = JSON.stringify(body);
  const res = await app.inject({
    method: 'POST',
    url: '/internal/matches',
    payload,
    headers: {
      'content-type': 'application/json',
      ...signInternalRequest(serverId, secret, 'POST', '/internal/matches', payload),
    },
  });
  if (res.statusCode >= 300)
    throw new Error(`${body.serverMatchId}: ${res.statusCode} ${res.body}`);
  return res.json();
}

/** Série md`bestOf` com os placares de cada jogo ([vermelho, azul]). */
async function playSeries(key, { format, bestOf, red, blue, redClan, blueClan, games, day }) {
  let r = 0;
  let b = 0;
  for (const [i, [rs, bs]] of games.entries()) {
    if (rs > bs) r++;
    else b++;
    const need = Math.ceil(bestOf / 2);
    const finished = r === need || b === need;
    await post(
      match({
        id: `fake-${key}-g${i + 1}`,
        ranked: true,
        format,
        map: MAPS[(i + key.length) % MAPS.length],
        red,
        blue,
        redScore: rs,
        blueScore: bs,
        endedAt: new Date(day.getTime() + i * 15 * 60_000),
        redClan,
        blueClan,
        series: {
          serverSeriesId: `fake-${key}`,
          bestOf,
          gameNo: i + 1,
          redWins: r,
          blueWins: b,
          finished,
          winner: finished ? (r > b ? 0 : 1) : null,
        },
      }),
    );
  }
}

const bot = (name) => ({ name });
const LC = rivals.LC;
const MV = rivals.MV;
const BDL = rivals.BDL;
const day = (d, h) => new Date(Date.UTC(2026, 9, d, h, 0, 0));

// 1. nn x LC, md3 3x3: o clã do PO vence de virada (1-2, 3-1, 5-4)
await playSeries('s1-nn-lc', {
  format: '3x3',
  bestOf: 3,
  red: mine.slice(0, 3),
  blue: LC.people.slice(0, 3),
  redClan: myClan,
  blueClan: LC.clan,
  games: [
    [1, 2],
    [3, 1],
    [5, 4],
  ],
  day: day(24, 21),
});
// 2. MV x nn, md3 3x3: o PO no azul, MV vence 2-0
await playSeries('s2-mv-nn', {
  format: '3x3',
  bestOf: 3,
  red: MV.people.slice(0, 3),
  blue: [mine[0], mine[2], mine[3]],
  redClan: MV.clan,
  blueClan: myClan,
  games: [
    [4, 2],
    [5, 3],
  ],
  day: day(25, 22),
});
// 3. nn x BDL, md5 4x4 (3-2)
await playSeries('s3-nn-bdl', {
  format: '4x4',
  bestOf: 5,
  red: mine,
  blue: BDL.people,
  redClan: myClan,
  blueClan: BDL.clan,
  games: [
    [2, 3],
    [5, 1],
    [0, 2],
    [4, 4 - 1],
    [5, 3],
  ],
  day: day(26, 20),
});
// 4. LC x BDL, md1 4x4 (sem o PO)
await playSeries('s4-lc-bdl', {
  format: '4x4',
  bestOf: 1,
  red: LC.people,
  blue: BDL.people,
  redClan: LC.clan,
  blueClan: BDL.clan,
  games: [[3, 2]],
  day: day(27, 19),
});
// 5. Ranked 3x3 misto (sem clã nos lados)
await playSeries('s5-mista', {
  format: '3x3',
  bestOf: 1,
  red: [me, loners[0], MV.people[1]],
  blue: [loners[1], loners[2], LC.people[3]],
  redClan: null,
  blueClan: null,
  games: [[2, 1]],
  day: day(27, 22),
});
// 6. Casual: o clã do PO vira o clã contra o azul padrão, com bots; e uma partida comum
await post(
  match({
    id: 'fake-c1',
    ranked: false,
    map: MAPS[4],
    red: [me, mine[1], bot('Bot Alfa')],
    blue: [loners[0], bot('Bot Bravo'), bot('Bot Charlie')],
    redScore: 4,
    blueScore: 2,
    endedAt: day(28, 18),
    redClan: myClan,
    blueClan: null,
  }),
);
await post(
  match({
    id: 'fake-c2',
    ranked: false,
    map: MAPS[5],
    red: [loners[1], me, bot('Bot Delta')],
    blue: [loners[2], BDL.people[2], bot('Bot Echo')],
    redScore: 1,
    blueScore: 3,
    endedAt: day(28, 19),
    redClan: null,
    blueClan: null,
  }),
);

console.log(
  `pronto: ${ME} e o clã ${myClan.tag} em 4 séries clã x clã, 1 ranqueada mista e 2 casuais; contas novas com senha "outgun-dev"`,
);
await app.close();
await database.close();
