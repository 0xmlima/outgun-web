// SPDX-License-Identifier: GPL-2.0-or-later
// Marcos do jogador (OG-213, RN-SOC-03): catálogo versionado e o cálculo a partir do histórico de
// partidas com conta. Puro: a API lê as partidas, chama `milestonesFrom` e grava o que faltar (o
// mesmo cálculo serve ao fim de cada partida e ao preenchimento retroativo, por isso é idempotente).
import { capturedWildFlag, longestKillChain, worstDeficit, type MilestoneEvents } from './milestone-events.js';
import type { Bilingual } from './privacy.js';

/** Partida de uma conta, na ordem em que terminou. Kills em bots já descontados. */
export interface MilestoneMatch {
  matchId: string;
  endedAt: string;
  /** 1 vitória, 0 empate, -1 derrota. */
  result: 1 | 0 | -1;
  kills: number;
  captures: number;
  shots: number;
  hits: number;
  /** Mortes, segundos jogados e o placar do outro lado (OG-390). Ausentes contam 0. */
  deaths?: number;
  playSeconds?: number;
  conceded?: number;
  /** Stats da partida (`match_players.stats`, OG-355/363); `botKills` sem desconto. Ausente = partida antiga. */
  stats?: Readonly<Record<string, number>>;
  /** Contexto da partida (OG-391). */
  ranked?: boolean;
  /** Formato da ranqueada (`3x3`, `4x4`, `5x5`). */
  format?: string;
  /** Arquivo do mapa; os gerados (`mapgen_*`) contam como um mapa só. */
  map?: string;
  /** Dia do fim da partida em America/Sao_Paulo (`AAAA-MM-DD`). */
  day?: string;
  /** Time da conta (0 vermelho, 1 azul). */
  team?: number;
  /** Contas no mesmo time (sem a própria, sem bots). */
  mates?: readonly string[];
  /** Série md3/md5 da partida (OG-250). */
  series?: { id: string; bestOf: number };
  /** Eventos da partida (OG-362; Casual desde a 2.39.1). Ausente = partida sem registro. */
  events?: MilestoneEvents;
  /** Partida clã x clã (OG-259, RN-RKL-14) do ponto de vista do clã da conta. */
  clanWar?: ClanWarMatch;
}

export interface ClanWarMatch {
  /** Clã adversário (id). */
  opponent: string;
  /** Capturas sofridas (placar do adversário). */
  conceded: number;
  /** Este jogo fechou uma série md3/md5 vencida pelo lado da conta; `sweep` = sem perder jogo. */
  seriesWon: boolean;
  sweep: boolean;
}

/** Seções do perfil (OG-393). */
export type MilestoneGroup = 'progress' | 'flag' | 'defense' | 'combat' | 'ranked' | 'social' | 'clan' | 'humor' | 'secret';

export interface Milestone {
  readonly id: string;
  readonly group: MilestoneGroup;
  readonly name: Bilingual;
  readonly description: Bilingual;
}

export interface Achieved {
  id: string;
  matchId: string;
  endedAt: string;
}

/** Tiros mínimos numa partida para valer o marco de precisão (1 em 1 não é pontaria). */
export const ACCURACY_MIN_SHOTS = 20;
/** Idem para o marco de 70%. */
export const ELITE_ACCURACY_MIN_SHOTS = 30;

const b = (pt: string, en: string): Bilingual => ({ 'pt-BR': pt, en });

/** Na ordem em que aparecem no perfil. Ids são estáveis (gravados no banco): nunca renomear. */
export const MILESTONES: readonly Milestone[] = [
  // progresso
  { id: 'first_match', group: 'progress', name: b('Estreia', 'Debut'), description: b('Jogou a primeira partida', 'Played the first match') },
  { id: 'matches_10', group: 'progress', name: b('Frequentador', 'Regular'), description: b('10 partidas', '10 matches') },
  { id: 'matches_100', group: 'progress', name: b('Veterano', 'Veteran'), description: b('100 partidas', '100 matches') },
  { id: 'matches_1000', group: 'progress', name: b('Lenda', 'Legend'), description: b('1000 partidas', '1000 matches') },
  { id: 'wins_1', group: 'progress', name: b('Primeira vitória', 'First win'), description: b('Venceu a primeira partida', 'Won the first match') },
  { id: 'wins_100', group: 'progress', name: b('Vencedor', 'Winner'), description: b('100 vitórias', '100 wins') },
  { id: 'wins_500', group: 'progress', name: b('Campeão', 'Champion'), description: b('500 vitórias', '500 wins') },
  { id: 'win_streak_10', group: 'progress', name: b('Imbatível', 'Unstoppable'), description: b('10 vitórias seguidas', '10 wins in a row') },
  { id: 'hours_10', group: 'progress', name: b('Dedicado', 'Dedicated'), description: b('10 horas jogadas', '10 hours played') },
  { id: 'hours_100', group: 'progress', name: b('Incansável', 'Tireless'), description: b('100 horas jogadas', '100 hours played') },
  { id: 'days_7', group: 'progress', name: b('Rotina', 'Routine'), description: b('Jogou em 7 dias seguidos', 'Played on 7 days in a row') },
  { id: 'maps_10', group: 'progress', name: b('Turista', 'Tourist'), description: b('Jogou em 10 mapas diferentes', 'Played on 10 different maps') },
  { id: 'maps_25', group: 'progress', name: b('Explorador', 'Explorer'), description: b('Jogou em 25 mapas diferentes', 'Played on 25 different maps') },
  // bandeira
  { id: 'first_capture', group: 'flag', name: b('Primeira captura', 'First capture'), description: b('Capturou a primeira bandeira', 'Captured the first flag') },
  { id: 'captures_50', group: 'flag', name: b('Ladrão de bandeiras', 'Flag thief'), description: b('50 capturas', '50 captures') },
  { id: 'captures_250', group: 'flag', name: b('Mestre das bandeiras', 'Flag master'), description: b('250 capturas', '250 captures') },
  { id: 'hat_trick', group: 'flag', name: b('Hat-trick', 'Hat-trick'), description: b('3 capturas numa partida', '3 captures in a match') },
  { id: 'returns_100', group: 'flag', name: b('Resgatador', 'Rescuer'), description: b('100 bandeiras devolvidas', '100 flags returned') },
  { id: 'carry_60', group: 'flag', name: b('Maratonista', 'Marathoner'), description: b('60 segundos com a bandeira numa partida', '60 seconds carrying the flag in a match') },
  { id: 'wild_flag', group: 'flag', name: b('Domador', 'Tamer'), description: b('Capturou a bandeira selvagem', 'Captured the wild flag') },
  // defesa
  { id: 'defenses_match_10', group: 'defense', name: b('Muralha', 'Wall'), description: b('10 defesas numa partida', '10 defenses in a match') },
  { id: 'defenses_250', group: 'defense', name: b('Guardião', 'Guardian'), description: b('250 defesas', '250 defenses') },
  { id: 'carriers_match_5', group: 'defense', name: b('Caça-portador', 'Carrier hunter'), description: b('Matou 5 portadores de bandeira numa partida', 'Killed 5 flag carriers in a match') },
  { id: 'shutout', group: 'defense', name: b('Sem chance', 'No chance'), description: b('Venceu uma partida sem sofrer captura', 'Won a match without conceding a capture') },
  // combate
  { id: 'kills_100', group: 'combat', name: b('Atirador', 'Gunner'), description: b('100 kills em jogadores', '100 kills on players') },
  { id: 'kills_1000', group: 'combat', name: b('Pistoleiro', 'Gunslinger'), description: b('1000 kills em jogadores', '1000 kills on players') },
  { id: 'kills_10000', group: 'combat', name: b('Outgunner', 'Outgunner'), description: b('10000 kills em jogadores', '10000 kills on players') },
  { id: 'accuracy_50', group: 'combat', name: b('Mira certeira', 'Sharpshooter'), description: b(`Precisão de 50% ou mais numa partida (mínimo de ${ACCURACY_MIN_SHOTS} tiros)`, `50% accuracy or better in a match (at least ${ACCURACY_MIN_SHOTS} shots)`) },
  { id: 'accuracy_70', group: 'combat', name: b('Atirador de elite', 'Marksman'), description: b(`Precisão de 70% ou mais numa partida (mínimo de ${ELITE_ACCURACY_MIN_SHOTS} tiros)`, `70% accuracy or better in a match (at least ${ELITE_ACCURACY_MIN_SHOTS} shots)`) },
  { id: 'streak_10', group: 'combat', name: b('Em chamas', 'On fire'), description: b('10 kills sem morrer', '10 kills without dying') },
  { id: 'streak_20', group: 'combat', name: b('Imparável', 'Unstoppable force'), description: b('20 kills sem morrer', '20 kills without dying') },
  { id: 'kills_match_30', group: 'combat', name: b('Massacre', 'Massacre'), description: b('30 kills numa partida', '30 kills in a match') },
  { id: 'flawless', group: 'combat', name: b('Intocável', 'Untouchable'), description: b('10 kills ou mais numa partida sem morrer nenhuma vez', '10 or more kills in a match without dying once') },
  { id: 'multi_kill', group: 'combat', name: b('Dobradinha', 'Double kill'), description: b('Fez o primeiro multi-kill', 'Scored the first multi-kill') },
  { id: 'triple_kill', group: 'combat', name: b('Triplo', 'Triple kill'), description: b('3 kills em sequência', '3 kills in a row') },
  { id: 'deathbringer_1', group: 'combat', name: b('Portador da morte', 'Deathbringer'), description: b('Matou com o deathbringer', 'Scored a kill with the deathbringer') },
  { id: 'deathbringer_50', group: 'combat', name: b('Ceifador', 'Reaper'), description: b('50 kills com o deathbringer', '50 deathbringer kills') },
  { id: 'trades_50', group: 'combat', name: b('Vingador', 'Avenger'), description: b('50 trocas (matou quem acabou de matar um aliado)', '50 trades (killed whoever just killed a teammate)') },
  { id: 'first_kills_50', group: 'combat', name: b('Abre-alas', 'Opener'), description: b('50 primeiros abates', '50 opening kills') },
  { id: 'assists_100', group: 'combat', name: b('Parceiro', 'Partner'), description: b('100 assistências', '100 assists') },
  { id: 'enemy_base_kills_100', group: 'combat', name: b('Invasor', 'Invader'), description: b('100 kills na base inimiga', '100 kills in the enemy base') },
  // ranqueada
  { id: 'ranked_first', group: 'ranked', name: b('Estreia ranqueada', 'Ranked debut'), description: b('Jogou a primeira ranqueada', 'Played the first ranked match') },
  { id: 'ranked_win', group: 'ranked', name: b('Primeira vitória ranqueada', 'First ranked win'), description: b('Venceu a primeira ranqueada', 'Won the first ranked match') },
  { id: 'ranked_wins_100', group: 'ranked', name: b('Ranqueado', 'Ranked regular'), description: b('100 vitórias ranqueadas', '100 ranked wins') },
  { id: 'win_3x3', group: 'ranked', name: b('Trio', 'Trio'), description: b('Venceu uma ranqueada 3x3', 'Won a 3v3 ranked match') },
  { id: 'win_4x4', group: 'ranked', name: b('Quarteto', 'Quartet'), description: b('Venceu uma ranqueada 4x4', 'Won a 4v4 ranked match') },
  { id: 'win_5x5', group: 'ranked', name: b('Quinteto', 'Quintet'), description: b('Venceu uma ranqueada 5x5', 'Won a 5v5 ranked match') },
  { id: 'series_bo5', group: 'ranked', name: b('Série longa', 'Long series'), description: b('Venceu uma série md5', 'Won a best-of-5 series') },
  { id: 'comeback', group: 'ranked', name: b('Virada', 'Comeback'), description: b('Venceu uma ranqueada depois de estar 2 capturas atrás', 'Won a ranked match after being 2 captures behind') },
  // social
  { id: 'beta', group: 'social', name: b('Pioneiro', 'Pioneer'), description: b('Jogou o beta', 'Played the beta') },
  { id: 'duo_50', group: 'social', name: b('Dupla dinâmica', 'Dynamic duo'), description: b('50 partidas no mesmo time do mesmo jogador', '50 matches on the same team as the same player') },
  // clã x clã (OG-259)
  { id: 'clan_war', group: 'clan', name: b('Guerra de clãs', 'Clan war'), description: b('Jogou a primeira partida clã x clã', 'Played the first clan vs clan match') },
  { id: 'clan_war_win', group: 'clan', name: b('Primeira conquista', 'First conquest'), description: b('Venceu a primeira partida clã x clã', 'Won the first clan vs clan match') },
  { id: 'clan_war_10', group: 'clan', name: b('Veterano de guerra', 'War veteran'), description: b('10 partidas clã x clã', '10 clan vs clan matches') },
  { id: 'clan_war_wins_10', group: 'clan', name: b('Senhor da guerra', 'Warlord'), description: b('10 vitórias clã x clã', '10 clan vs clan wins') },
  { id: 'clan_series_win', group: 'clan', name: b('Série conquistada', 'Series conquered'), description: b('Venceu uma série clã x clã (md3 ou md5)', 'Won a clan vs clan series (bo3 or bo5)') },
  { id: 'clan_sweep', group: 'clan', name: b('Varrida', 'Clean sweep'), description: b('Venceu uma série clã x clã sem perder um jogo', 'Won a clan vs clan series without losing a game') },
  { id: 'clan_rivalry_5', group: 'clan', name: b('Rivalidade', 'Rivalry'), description: b('5 partidas clã x clã contra o mesmo clã', '5 clan vs clan matches against the same clan') },
  { id: 'clan_defender', group: 'clan', name: b('Defensor do clã', 'Clan defender'), description: b('Venceu uma partida clã x clã sem sofrer captura', 'Won a clan vs clan match without conceding a capture') },
];

/** Contadores somados partida a partida; também mostram o progresso no perfil (OG-393). */
export type MilestoneCounter = 'matches' | 'wins' | 'kills' | 'captures' | 'playSeconds' | 'flagsReturned' | 'defenses' | 'trades' | 'firstKills' | 'assists' | 'killsEnemyBase' | 'rankedWins' | 'deathbringerKills';

const stat = (m: MilestoneMatch, key: string): number => m.stats?.[key] ?? 0;

const COUNTERS: Readonly<Record<MilestoneCounter, (m: MilestoneMatch) => number>> = {
  matches: () => 1,
  wins: (m) => (m.result > 0 ? 1 : 0),
  kills: (m) => Math.max(0, m.kills),
  captures: (m) => m.captures,
  playSeconds: (m) => m.playSeconds ?? 0,
  flagsReturned: (m) => stat(m, 'flagsReturned'),
  defenses: (m) => stat(m, 'defenses'),
  trades: (m) => stat(m, 'trades'),
  firstKills: (m) => stat(m, 'firstKills'),
  assists: (m) => stat(m, 'assists'),
  killsEnemyBase: (m) => stat(m, 'killsEnemyBase'),
  rankedWins: (m) => (m.ranked && m.result > 0 ? 1 : 0),
  deathbringerKills: (m) => stat(m, 'deathbringerKills'),
};

const HOUR = 3600;
/** Marcos de total: contador e alvo. */
export const MILESTONE_TOTALS: Readonly<Record<string, { counter: MilestoneCounter; target: number }>> = {
  first_match: { counter: 'matches', target: 1 },
  matches_10: { counter: 'matches', target: 10 },
  matches_100: { counter: 'matches', target: 100 },
  matches_1000: { counter: 'matches', target: 1000 },
  wins_1: { counter: 'wins', target: 1 },
  wins_100: { counter: 'wins', target: 100 },
  wins_500: { counter: 'wins', target: 500 },
  hours_10: { counter: 'playSeconds', target: 10 * HOUR },
  hours_100: { counter: 'playSeconds', target: 100 * HOUR },
  first_capture: { counter: 'captures', target: 1 },
  captures_50: { counter: 'captures', target: 50 },
  captures_250: { counter: 'captures', target: 250 },
  returns_100: { counter: 'flagsReturned', target: 100 },
  defenses_250: { counter: 'defenses', target: 250 },
  kills_100: { counter: 'kills', target: 100 },
  kills_1000: { counter: 'kills', target: 1000 },
  kills_10000: { counter: 'kills', target: 10000 },
  trades_50: { counter: 'trades', target: 50 },
  first_kills_50: { counter: 'firstKills', target: 50 },
  assists_100: { counter: 'assists', target: 100 },
  enemy_base_kills_100: { counter: 'killsEnemyBase', target: 100 },
  ranked_wins_100: { counter: 'rankedWins', target: 100 },
  deathbringer_1: { counter: 'deathbringerKills', target: 1 },
  deathbringer_50: { counter: 'deathbringerKills', target: 50 },
};

/** Alvos dos marcos que contam coisas distintas (progresso no OG-393). */
export const MAPS_TARGETS = { maps_10: 10, maps_25: 25 } as const;
export const DAYS_STREAK = 7;
export const DUO_MATCHES = 50;
export const COMEBACK_DEFICIT = 2;

/** Mapas gerados (`mapgen_*`, OG-015) contam como um só. */
export const mapKey = (map: string): string => (map.startsWith('mapgen_') ? 'mapgen' : map);

const dayNumber = (day: string): number => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

/**
 * Feitos de uma partida só. Os de kills exigem partida sem kills em bots (`botKills`), que o
 * `consecutiveKills` e o `kills` cru do jsonb não separam.
 */
const noBots = (m: MilestoneMatch) => m.stats !== undefined && stat(m, 'botKills') === 0;
const FEATS: Readonly<Record<string, (m: MilestoneMatch) => boolean>> = {
  hat_trick: (m) => m.captures >= 3,
  carry_60: (m) => stat(m, 'flagCarryingTime') >= 60,
  defenses_match_10: (m) => stat(m, 'defenses') >= 10,
  carriers_match_5: (m) => stat(m, 'carriersKilled') >= 5,
  shutout: (m) => m.result > 0 && m.conceded === 0,
  accuracy_50: (m) => m.shots >= ACCURACY_MIN_SHOTS && m.hits * 2 >= m.shots,
  accuracy_70: (m) => m.shots >= ELITE_ACCURACY_MIN_SHOTS && m.hits * 10 >= m.shots * 7,
  streak_10: (m) => noBots(m) && stat(m, 'consecutiveKills') >= 10,
  streak_20: (m) => noBots(m) && stat(m, 'consecutiveKills') >= 20,
  kills_match_30: (m) => noBots(m) && m.kills >= 30,
  flawless: (m) => noBots(m) && m.kills >= 10 && m.deaths === 0,
  multi_kill: (m) => stat(m, 'multiKills') >= 1,
  wild_flag: (m) => m.events !== undefined && capturedWildFlag(m.events),
  triple_kill: (m) => m.events !== undefined && longestKillChain(m.events) >= 3,
  ranked_first: (m) => m.ranked === true,
  ranked_win: (m) => m.ranked === true && m.result > 0,
  win_3x3: (m) => m.ranked === true && m.result > 0 && m.format === '3x3',
  win_4x4: (m) => m.ranked === true && m.result > 0 && m.format === '4x4',
  win_5x5: (m) => m.ranked === true && m.result > 0 && m.format === '5x5',
  comeback: (m) => m.ranked === true && m.result > 0 && m.events !== undefined && m.team !== undefined && worstDeficit(m.events, m.team) >= COMEBACK_DEFICIT,
};

/** Placar de cada série md3/md5 do ponto de vista da conta, jogo a jogo. */
interface SeriesState {
  wins: number;
  losses: number;
  done: boolean;
}

/**
 * Marcos que o histórico `matches` (ordem de término) concede, com a partida da conquista.
 * `beta`: as partidas foram jogadas durante o beta (marco na primeira delas).
 */
export function milestonesFrom(matches: readonly MilestoneMatch[], o: { beta?: boolean } = {}): Achieved[] {
  const found = new Map<string, Achieved>();
  const give = (id: string, m: MilestoneMatch) => {
    if (!found.has(id)) found.set(id, { id, matchId: m.matchId, endedAt: m.endedAt });
  };
  const sums = Object.fromEntries(Object.keys(COUNTERS).map((k) => [k, 0])) as Record<MilestoneCounter, number>;
  let streak = 0;
  const wars = { matches: 0, wins: 0, against: new Map<string, number>() };
  const maps = new Set<string>();
  const mates = new Map<string, number>();
  const series = new Map<string, SeriesState>();
  let lastDay: number | null = null;
  let days = 0;
  for (const m of matches) {
    for (const k of Object.keys(COUNTERS) as MilestoneCounter[]) sums[k] += COUNTERS[k](m);
    for (const [id, t] of Object.entries(MILESTONE_TOTALS)) if (sums[t.counter] >= t.target) give(id, m);
    for (const [id, feat] of Object.entries(FEATS)) if (feat(m)) give(id, m);
    streak = m.result > 0 ? streak + 1 : 0;
    if (streak >= 10) give('win_streak_10', m);
    if (o.beta) give('beta', m);
    if (m.map) {
      maps.add(mapKey(m.map));
      for (const [id, n] of Object.entries(MAPS_TARGETS)) if (maps.size >= n) give(id, m);
    }
    if (m.day) {
      const d = dayNumber(m.day);
      if (lastDay === null || d - lastDay > 1) days = 1;
      else if (d - lastDay === 1) days++;
      lastDay = d;
      if (days >= DAYS_STREAK) give('days_7', m);
    }
    for (const mate of m.mates ?? []) {
      const n = (mates.get(mate) ?? 0) + 1;
      mates.set(mate, n);
      if (n >= DUO_MATCHES) give('duo_50', m);
    }
    if (m.series) {
      const s = series.get(m.series.id) ?? { wins: 0, losses: 0, done: false };
      series.set(m.series.id, s);
      if (!s.done) {
        if (m.result > 0) s.wins++;
        else if (m.result < 0) s.losses++;
        const need = Math.floor(m.series.bestOf / 2) + 1;
        if (s.wins >= need || s.losses >= need) s.done = true;
        if (s.wins >= need && m.series.bestOf >= 5) give('series_bo5', m);
      }
    }
    const w = m.clanWar;
    if (w) {
      wars.matches++;
      if (m.result > 0) wars.wins++;
      const against = (wars.against.get(w.opponent) ?? 0) + 1;
      wars.against.set(w.opponent, against);
      give('clan_war', m);
      if (m.result > 0) give('clan_war_win', m);
      if (wars.matches >= 10) give('clan_war_10', m);
      if (wars.wins >= 10) give('clan_war_wins_10', m);
      if (w.seriesWon) give('clan_series_win', m);
      if (w.seriesWon && w.sweep) give('clan_sweep', m);
      if (against >= 5) give('clan_rivalry_5', m);
      if (m.result > 0 && w.conceded === 0) give('clan_defender', m);
    }
  }
  const order = new Map(MILESTONES.map((x, i) => [x.id, i]));
  return [...found.values()].sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
}
