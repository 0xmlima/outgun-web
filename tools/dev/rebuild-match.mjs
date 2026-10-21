#!/usr/bin/env node
// SPDX-License-Identifier: GPL-2.0-or-later
// Reconstrói o resultado de uma partida (o corpo de POST /internal/matches) a partir do replay, para
// recuperar uma partida que a API recusou (OG-330). Usa o `matchReport` do game server; as estatísticas
// vêm das últimas mensagens `stats`/`movementShots`/`teamStats` e o ranking é recalculado pelas regras
// do `ServerSim` (frag × modificador do time; neg por morte, bandeira perdida na morte e captura sofrida).
// Os tempos chegam em segundos inteiros: a fração é estimada (erro < 0,5 s).
//
// Uso (depois de `pnpm build`):
//   node tools/dev/rebuild-match.mjs <replay.ogr> <params.json> > report.json
// params.json: { "endedAt": ISO, "accounts": { "<nome>": "<uuid>" }, "rules": MatchRules,
//                "format"?: "3x3", "series"?: MatchSeries, "substitutions"?: [], "replayBase"?: URL }
// Avisos (eventos que a reconstrução não cobre) saem no stderr; confira antes de enviar.
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (p) => import(join(root, p));
const { readReplayPrefix, decodeReplayBody } = await load('packages/protocol/dist/index.js');
const { toOutgunUnits } = await load('packages/sim/dist/index.js');
const { matchReport } = await load('apps/game-server/dist/match-report.js');
const { teamModifiers } = await load('apps/game-server/dist/ranking.js');

const [replayPath, paramsPath] = process.argv.slice(2);
if (!replayPath || !paramsPath) {
  console.error('uso: node tools/dev/rebuild-match.mjs <replay.ogr> <params.json>');
  process.exit(2);
}
const params = JSON.parse(readFileSync(paramsPath, 'utf8'));
const prefix = readReplayPrefix(new Uint8Array(readFileSync(replayPath)));
if (!prefix) throw new Error(`${replayPath} não é um replay`);
const replay = decodeReplayBody(gunzipSync(prefix.body), prefix.version, prefix.protocol);
const serverMatchId = basename(replayPath, '.ogr');
const half = replay.header.maxPlayers / 2;
const teamOf = (pid) => (pid < half ? 0 : 1);
const lastFrame = replay.frames.length - 1;
const end = (lastFrame + 1) / 10;
const warnings = [];

const present = new Map(); // pid → { name, bot }
const info = {},
  stat = {},
  statFrame = {},
  history = {},
  movement = {};
const teamStats = {},
  teamMovement = {};
const neg = {},
  dbKills = {},
  dbDeaths = {},
  botKills = {};
const scores = [0, 0];
const lastFrameCaptures = [];
const add = (map, pid, n = 1) => (map[pid] = (map[pid] ?? 0) + n);
const messages = [
  ...replay.init.map((m) => [-1, m]),
  ...replay.frames.flatMap((f, i) => f.map((m) => [i, m])),
];

for (const [i, m] of messages) {
  switch (m.type) {
    case 'playerJoined':
      present.set(m.pid, { name: m.name, bot: m.bot });
      break;
    case 'playerLeft':
      warnings.push(
        `pid ${m.pid} saiu no frame ${i}: confira substituições e deltas enviados à parte`,
      );
      present.delete(m.pid);
      break;
    case 'playerInfo':
      info[m.pid] = m;
      break;
    case 'stats':
      stat[m.stats.pid] = m.stats;
      statFrame[m.stats.pid] = i;
      (history[m.stats.pid] ??= []).push([i, m.stats]);
      break;
    case 'movementShots':
      movement[m.pid] = m.data;
      break;
    case 'teamStats':
      teamStats[m.team] = m;
      break;
    case 'teamMovementShots':
      teamMovement.red = m.red;
      teamMovement.blue = m.blue;
      break;
    case 'scoreUpdate':
      scores[m.team === 'red' ? 0 : 1] = m.score;
      break;
    case 'kill': // `killPlayer`: −1 e mais −1 se perdeu a bandeira
      add(neg, m.target, m.carriedFlag !== 'none' ? 2 : 1);
      if (m.cause === 'deathbringer') {
        add(dbKills, m.attacker);
        add(dbDeaths, m.target);
      }
      if (present.get(m.target)?.bot && teamOf(m.attacker) !== teamOf(m.target))
        add(botKills, m.attacker);
      break;
    case 'suicideEvent':
      add(neg, m.pid, m.carriedFlag !== 'none' ? 2 : 1);
      break;
    case 'capture': // `playerCapturesFlag`: −1 para cada adversário (exceto bandeira selvagem)
      if (m.flagTeam !== 'wild')
        for (const pid of present.keys()) if (teamOf(pid) !== teamOf(m.pid)) add(neg, pid);
      if (i === lastFrame) lastFrameCaptures.push(m);
      break;
  }
}

// eventos que mudam as estatísticas depois da última `stats` de alguém ficariam de fora
for (const [i, m] of messages) {
  const late = (pid) => present.has(pid) && i > statFrame[pid];
  if (
    (m.type === 'kill' && (late(m.attacker) || late(m.target))) ||
    (m.type === 'capture' && i !== lastFrame && late(m.pid))
  )
    warnings.push(`${m.type} sem stats depois (frame ${i})`);
}

// a captura que encerra a partida não chega a gerar `stats`/`scoreUpdate`: aplica +2 ao time, +3 ao capturador
const mapTime = Math.trunc(replay.header.frames / 10);
for (const c of lastFrameCaptures) {
  const team = teamOf(c.pid);
  for (const pid of Object.keys(stat)) if (teamOf(+pid) === team) stat[pid].frags += 2;
  stat[c.pid].frags += 3;
  stat[c.pid].captures += 1;
  scores[team] += 1;
  teamStats[team === 0 ? 'red' : 'blue'].captures.push({
    time: mapTime,
    pid: c.pid,
    assistant: c.assistant,
  });
}

/** Valor que cresce 1 s por segundo enquanto `active`: cada mensagem (segundos truncados) limita a fração. */
function timed(pid, key, active) {
  const h = history[pid];
  const [lastI, last] = h.at(-1);
  if (!active(last)) return last[key] + 0.5;
  let lo = -Infinity,
    hi = Infinity;
  for (let k = h.length - 1; k >= 0; k--) {
    const [i, s] = h[k];
    const drift = last[key] - s[key] - (lastI - i) / 10; // ≈ 0 no mesmo trecho ativo
    if (!active(s) || Math.abs(drift) > 1) break;
    lo = Math.max(lo, s[key] - i / 10);
    hi = Math.min(hi, s[key] + 1 - i / 10);
  }
  return (lo + hi) / 2 + end;
}

const players = Object.keys(stat)
  .map(Number)
  .map((pid) => {
    const s = stat[pid];
    const mv = movement[pid] ?? { movement: 0, shots: 0, hits: 0, shotsTaken: 0 };
    if (!movement[pid]) warnings.push(`pid ${pid} sem movementShots`);
    const lifetime = timed(pid, 'lifetime', (x) => !x.dead);
    const dist = toOutgunUnits(mv.movement);
    return {
      pid,
      team: teamOf(pid),
      frags: s.frags,
      captures: s.captures,
      assists: s.assists,
      kills: s.kills,
      deaths: s.deaths,
      suicides: s.suicides,
      deathbringerKills: dbKills[pid] ?? 0,
      deathbringerDeaths: dbDeaths[pid] ?? 0,
      consecutiveKills: s.consKills,
      consecutiveDeaths: s.consDeaths,
      flagsTaken: s.flagsTaken,
      flagsDropped: s.flagsDropped,
      flagsReturned: s.flagsReturned,
      carriersKilled: s.carriersKilled,
      flagCarryingTime: timed(pid, 'flagCarryingTime', (x) => x.carriedFlag !== 'none'),
      shots: mv.shots,
      hits: mv.hits,
      accuracy: mv.shots ? mv.hits / mv.shots : 0,
      shotsTaken: mv.shotsTaken,
      lifetime,
      averageLifetime: lifetime / (s.deaths + 1),
      playtime: timed(pid, 'playtime', () => true),
      movement: dist,
      speed: lifetime ? dist / lifetime : 0,
    };
  });
players.sort((a, b) => a.team - b.team || b.frags - a.frags);

const team = (key, idx) => {
  const t = teamStats[key],
    mv = teamMovement[key];
  return {
    score: scores[idx],
    kills: t.kills,
    deaths: t.deaths,
    suicides: t.suicides,
    flagsTaken: t.flagsTaken,
    flagsDropped: t.flagsDropped,
    flagsReturned: t.flagsReturned,
    shots: mv.shots,
    hits: mv.hits,
    accuracy: mv.shots ? mv.hits / mv.shots : 0,
    shotsTaken: mv.shotsTaken,
    movement: toOutgunUnits(mv.movement),
    captures: t.captures.map((c) => ({
      time: c.time,
      pid: c.pid,
      assistPid: c.assistant === 255 ? -1 : c.assistant,
    })),
  };
};
const reason =
  scores[0] >= params.rules.captureLimit || scores[1] >= params.rules.captureLimit
    ? 'captureLimit'
    : (params.reason ?? 'captureLimit');
const result = {
  reason,
  mapTime,
  mapTitle: replay.header.mapTitle,
  mapCrc: 0,
  winner: scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1,
  teams: [team('red', 0), team('blue', 1)],
  players,
};

// ranking (`Room.teamModifiers`): rating de cada um no início, de `playerInfo`; bots e convidados valem 1,0
const modifiers = teamModifiers(
  [...present].map(([pid, p]) => ({
    team: teamOf(pid),
    score: p.bot ? 0 : (info[pid]?.score ?? 0),
    neg: p.bot ? 0 : (info[pid]?.negScore ?? 0),
  })),
  (params.respawnBalancingTime ?? 0) >= 5,
);
const ranked = (pid) => !present.get(pid)?.bot && info[pid]?.ranked === true;
const deltas = (pid) =>
  ranked(pid)
    ? { score: Math.trunc(stat[pid].frags * modifiers[teamOf(pid)]) || 0, neg: neg[pid] ?? 0 }
    : { score: 0, neg: 0 };

for (const [, p] of present)
  if (!p.bot && !params.accounts?.[p.name]) warnings.push(`sem conta para ${p.name}`);
const report = matchReport({
  serverMatchId,
  replayUrl: `${params.replayBase ?? 'https://outgunweb.com.br/gs/replays'}/${serverMatchId}.ogr`,
  roomId: replay.header.roomId,
  mode: replay.header.mode,
  ranked: replay.header.mode === 'ranked',
  deltas,
  rules: params.rules,
  map: replay.header.map,
  result,
  startedAt: Date.parse(replay.header.startedAt),
  endedAt: Date.parse(params.endedAt),
  who: (pid) => {
    const p = present.get(pid);
    return (
      p && {
        name: p.name,
        accountId: p.bot ? null : (params.accounts?.[p.name] ?? null),
        bot: p.bot,
        botKills: botKills[pid] ?? 0,
      }
    );
  },
  ...(params.format ? { format: params.format } : {}),
  ...(params.series ? { series: params.series } : {}),
  substitutions: params.substitutions ?? [],
});
console.error(JSON.stringify({ modifiers, score: scores, warnings }));
console.log(JSON.stringify(report, null, 2));
