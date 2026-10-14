// SPDX-License-Identifier: GPL-2.0-or-later
// Conteúdo das telas F2–F5 (OG-066, spec plan/specs/telas-estatisticas.md): `team_statistics`,
// `draw_statistics`, `map_list` e `TM_ServerSettings` do original, como tabelas (o desenho fica no
// componente; aqui só textos, colunas e cores).
import type { ClientSession } from '@outgun/netcode';
import type { GameSettings } from '@outgun/settings';
import { toOutgunUnits } from '@outgun/sim';

export type Tone = 'text' | 'highlight' | 'selected' | 'dimmed' | 'red' | 'blue';
export interface Row {
  readonly cells: readonly string[];
  readonly tone: Tone;
}
export interface Table {
  readonly caption?: string;
  readonly captionTone?: Tone;
  readonly header?: readonly string[];
  readonly rows: readonly Row[];
}
export interface InfoScreen {
  readonly title: string;
  readonly tables: readonly Table[];
  /** Linhas depois das tabelas (ordenação, voto, página). */
  readonly footer: readonly Row[];
}

type T = (text: string, ...args: string[]) => string;

const clock = (seconds: number) => {
  const s = Math.max(0, Math.trunc(seconds));
  return `${Math.trunc(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const pct = (part: number, whole: number) => `${whole > 0 ? Math.round((100 * part) / whole) : 0}%`;
const teamOf = (s: ClientSession, pid: number): 0 | 1 => (s.maxPlayers && pid >= s.maxPlayers / 2 ? 1 : 0);

/** Estatísticas do jogador agora: o retrato do servidor com os tempos avançados no cliente. */
export function currentStats(s: ClientSession, pid: number) {
  const got = s.playerStats.get(pid);
  if (!got) return null;
  const dt = s.gameOver ? 0 : Math.max(0, s.gameTime() - got.at);
  const st = got.stats;
  return {
    ...st,
    playtime: st.playtime + dt,
    lifetime: st.lifetime + (st.dead ? 0 : dt),
    flagCarryingTime: st.flagCarryingTime + (st.carriedFlag === 'none' ? 0 : dt),
  };
}

/** Jogadores na ordem do placar (`compare_players`: vermelhos, azuis; mais frags primeiro; estável). */
export function playersInOrder(s: ClientSession): number[] {
  return [...s.present].sort((a, b) => teamOf(s, a) - teamOf(s, b) || (s.frags.get(b) ?? 0) - (s.frags.get(a) ?? 0) || a - b);
}

/** F3 — `team_statistics`. */
export function teamScreen(s: ClientSession, t: T): InfoScreen {
  const ts = s.teamStats;
  const ms = s.teamMovementShots;
  const shots = [ms?.red, ms?.blue];
  const value = (team: 0 | 1, f: (x: NonNullable<(typeof ts)[0]>) => number) => String(ts[team] ? f(ts[team]!) : 0);
  const row = (label: string, red: string, blue: string): Row => ({ cells: [t(label), red, blue], tone: 'text' });
  const per = (label: string, f: (x: NonNullable<(typeof ts)[0]>) => number) => row(label, value(0, f), value(1, f));
  const sh = (label: string, f: (x: { movement: number; shots: number; hits: number; shotsTaken: number }) => string) =>
    row(label, shots[0] ? f(shots[0]) : '0', shots[1] ? f(shots[1]) : '0');
  const stats: Table = {
    header: ['', t('Red Team'), t('Blue Team')],
    rows: [
      row('Captures', String(s.teamScores[0]), String(s.teamScores[1])),
      per('Kills', (x) => x.kills),
      per('Deaths', (x) => x.deaths),
      per('Suicides', (x) => x.suicides),
      per('Flags taken', (x) => x.flagsTaken),
      per('Flags dropped', (x) => x.flagsDropped),
      per('Flags returned', (x) => x.flagsReturned),
      sh('Shots', (x) => String(x.shots)),
      sh('Hit accuracy', (x) => pct(x.hits, x.shots)),
      sh('Shots taken', (x) => String(x.shotsTaken)),
      sh('Movement', (x) => String(Math.trunc(toOutgunUnits(x.movement)))),
    ],
  };
  // capturas na ordem do tempo, com o placar depois de cada uma (o vermelho primeiro no empate)
  const name = (pid: number) => s.names.get(pid) ?? s.pastNames.get(pid) ?? '?';
  const caps = ([0, 1] as const)
    .flatMap((team) => (ts[team]?.captures ?? []).map((c) => ({ ...c, team })))
    .sort((a, b) => a.time - b.time || a.team - b.team);
  const base: [number, number] = [0, 1].map((team) => s.teamScores[team]! - (ts[team as 0 | 1]?.captures.length ?? 0)) as [number, number];
  const score = [Math.max(0, base[0]), Math.max(0, base[1])];
  const rows: Row[] = caps.map((c) => {
    score[c.team]!++;
    const who = c.assistant === 255 ? name(c.pid) : `${name(c.pid)} + ${name(c.assistant)}`;
    return { cells: [clock(c.time), `${score[0]} - ${score[1]}`, who], tone: c.team === 0 ? 'red' : 'blue' };
  });
  return { title: t('Team stats'), tables: [stats, ...(rows.length ? [{ rows }] : [])], footer: [] };
}

/** Cabeçalhos das 4 páginas de F4 (`draw_statistics`). */
export const PLAYER_PAGES = [
  ['Ping', 'Frags', 'Capt', 'Kills', 'Deaths', 'Suicides'],
  ['Flags taken', 'dropped', 'returned', 'Carriers killed', 'Carry time'],
  ['Shots', 'Accuracy', 'Taken', 'Movement', 'Speed'],
  ['Playtime', 'Average lifetime', 'rank', 'power', 'score'],
] as const;

/** F4 — `draw_statistics` / `draw_player_statistics`, página 0..3. */
export function playerScreen(s: ClientSession, page: number, t: T): InfoScreen {
  const order = playersInOrder(s);
  const tables: Table[] = ([0, 1] as const).map((team) => {
    const pids = order.filter((pid) => teamOf(s, pid) === team);
    return {
      caption: `${t(team === 0 ? 'Red Team' : 'Blue Team')} (${pids.length})`,
      captionTone: team === 0 ? 'red' : 'blue',
      header: ['', '', ...PLAYER_PAGES[page]!.map((h) => t(h))],
      rows: pids.map((pid): Row => {
        const st = currentStats(s, pid);
        const info = s.playerInfo.get(pid);
        const flags = `${info?.loggedIn ? 'M' : ' '}${info?.ranked ? 'R' : ' '} ${info?.admin ? 'A' : ' '}`;
        const name = s.names.get(pid) ?? '';
        let values: string[];
        if (!st) values = [];
        else if (page === 0)
          values = [String(s.pings.get(pid) ?? 0), String(st.frags), String(st.captures), `${st.kills}/${st.curConsKills}/${st.consKills}`, `${st.deaths}/${st.curConsDeaths}/${st.consDeaths}`, String(st.suicides)];
        else if (page === 1) values = [String(st.flagsTaken), String(st.flagsDropped), String(st.flagsReturned), String(st.carriersKilled), clock(st.flagCarryingTime)];
        else if (page === 2) {
          const ms = s.movementShots.get(pid);
          const units = ms ? toOutgunUnits(ms.movement) : 0;
          values = [String(ms?.shots ?? 0), pct(ms?.hits ?? 0, ms?.shots ?? 0), String(ms?.shotsTaken ?? 0), `${Math.trunc(units)} u`, `${(st.lifetime > 0 ? units / st.lifetime : 0).toFixed(2)} u/s`];
        } else {
          const minutes = Math.trunc(st.playtime / 60);
          const avg = st.lifetime / (st.deaths + 1);
          values = [st.playtime > 2 * 60 * 60 ? `${Math.trunc(minutes / 60)} h` : `${minutes} min`, clock(avg)];
          if (info?.loggedIn) values.push(String(info.rank), ((info.score + 1) / (info.negScore + 1)).toFixed(2), String(info.score - info.negScore));
        }
        return { cells: [flags, name.slice(0, 17), ...values], tone: team === 0 ? 'red' : 'blue' };
      }),
    };
  });
  const ranked = Math.max(0, ...[...s.playerInfo.values()].map((i) => i.rankedPlayers));
  const footer: Row[] = [];
  if (page === 3 && ranked > 0) footer.push({ cells: [t('$1 players in the ranking.', String(ranked))], tone: 'highlight' });
  footer.push({ cells: [`${page + 1}/4`], tone: 'highlight' });
  return { title: t('Player stats'), tables, footer };
}

export type MapSort = 'number' | 'votes' | 'title' | 'size' | 'author';
export const MAP_SORTS: readonly MapSort[] = ['number', 'votes', 'title', 'size', 'author'];
const SORT_LABEL: Record<MapSort, string> = { number: 'Map number', votes: 'Votes', title: 'Title', size: 'Size', author: 'Author' };

/** `MapListSorter` (ordenação estável); devolve os índices da rotação. */
export function sortMaps(maps: readonly { title: string; author: string; width: number; height: number }[], votes: readonly number[], key: MapSort): number[] {
  const idx = maps.map((_, i) => i);
  const ci = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());
  const cmp: Record<MapSort, (a: number, b: number) => number> = {
    number: () => 0,
    votes: (a, b) => (votes[b] ?? 0) - (votes[a] ?? 0),
    title: (a, b) => ci(maps[a]!.title, maps[b]!.title),
    size: (a, b) => maps[a]!.width * maps[a]!.height - maps[b]!.width * maps[b]!.height || maps[a]!.width - maps[b]!.width,
    author: (a, b) => ci(maps[a]!.author, maps[b]!.author),
  };
  return idx.sort((a, b) => cmp[key](a, b) || a - b);
}

/** F2 — `map_list`. */
/**
 * Lista de mapas (F2). `unknown(file)`: o mapa não está entre os do jogo (gerado ou próprio do
 * servidor); com "Highlight maps not in maps.txt" (OG-070) ele aparece destacado.
 */
export function mapScreen(s: ClientSession, key: MapSort, ownVote: number, edit: string, t: T, unknown?: (file: string) => boolean): InfoScreen {
  const rows = sortMaps(s.mapList, s.mapVoteCounts, key).map((i): Row => {
    const m = s.mapList[i]!;
    const votes = s.mapVoteCounts[i] ?? 0;
    return {
      cells: [String(i + 1), votes > 0 ? String(votes) : '-', ownVote === i ? '*' : '', m.title.slice(0, 20), m.width > 0 ? `${m.width}x${m.height}` : '', m.author.slice(0, 27)],
      tone: i === s.currentMapIndex ? 'selected' : unknown?.(m.file) ? 'highlight' : 'text',
    };
  });
  return {
    title: t('Server map list'),
    tables: [{ header: [t('Nr'), t('Vote'), '', t('Title'), t('Size'), t('Author')], rows }],
    footer: [
      { cells: [t('Sort order (space to cycle): $1', t(SORT_LABEL[key]))], tone: 'text' },
      { cells: [`${t('Vote map number')}: ${edit}_`], tone: 'highlight' },
    ],
  };
}

/** F5 — `TM_ServerSettings` (mesma ordem das linhas). */
export function serverScreen(settings: GameSettings, preset: string, title: string, t: T): InfoScreen {
  const w = settings.world;
  const p = settings.powerups;
  const ph = settings.physics;
  const onOff = (v: boolean) => t(v ? 'on' : 'off');
  const rows: [string, string][] = [
    ['Rules', preset],
    ['Capture limit', w.captureLimit === 0 ? t('none') : String(w.captureLimit)],
    ['Time limit', w.timeLimit === 0 ? t('none') : t('$1 min', String(Math.trunc(w.timeLimit / 600)))],
  ];
  if (w.timeLimit !== 0) {
    const et = t('$1 min', String(Math.trunc(w.extraTime / 600)));
    rows.push(['Extra-time', w.extraTime === 0 ? t('none') : w.extraTimePeriods > 1 ? `${w.extraTimePeriods}x${et}` : et]);
  }
  if (w.flagReturnDelay >= 0) rows.push(['Flag return delay', t('$1 s', w.flagReturnDelay.toFixed(1))]);
  rows.push(
    ['Player collisions', ph.playerCollisions === 'no' ? t('off') : ph.playerCollisions === 'normal' ? t('on') : t('special')],
    ['Friendly fire', ph.friendlyFire === 0 ? t('off') : `${Math.round(100 * ph.friendlyFire)}%`],
    ['Balance teams', onOff(w.balanceTeams !== 'no')],
    ['Drop power-ups', onOff(p.pupsDropAtDeath)],
    ['Invisible shadow', onOff(w.shadowMinimum === 0)],
    ['Shadowed see each other', onOff(p.shadowSeeShadow)],
    ['Switch deathbringer', onOff(p.pupDeathbringerSwitch)],
    ['One hit shield', onOff(p.pupShieldHits === 1)],
    ['Maximum weapon level', String(p.pupWeaponMax)],
  );
  const constPowerups = p.pupsMax === 0 || (p.pupsMinPercentage === p.pupsMaxPercentage && p.pupsMin >= p.pupsMax);
  const amount = (v: number, percent: boolean) => (percent && v !== 0 ? t('$1% of rooms', String(v)) : String(v));
  if (!constPowerups) rows.push(['Minimum powerups', amount(p.pupsMin, p.pupsMinPercentage)]);
  rows.push([constPowerups ? 'Powerups' : 'Maximum powerups', amount(p.pupsMax, p.pupsMaxPercentage)]);
  if (p.pupsMax !== 0) {
    const constTime = p.pupMaxTime <= p.pupAddTime;
    if (!constTime) rows.push(['Powerup add time', t('$1 s', String(p.pupAddTime))]);
    rows.push([constTime ? 'Powerup time' : 'Powerup max time', t('$1 s', String(p.pupMaxTime))]);
  }
  return { title, tables: [{ rows: rows.map(([k, v]) => ({ cells: [t(k), v], tone: 'text' })) }], footer: [] };
}
