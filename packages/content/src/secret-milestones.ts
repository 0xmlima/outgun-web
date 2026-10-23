// SPDX-License-Identifier: GPL-2.0-or-later
// Marcos secretos (OG-398, RN-SOC-06). Ficam fora do `index.ts` de propósito: o cliente importa o
// catálogo de `@outgun/content` e não pode receber nome nem condição de um secreto que o jogador
// não tem. Só a API importa este módulo (`@outgun/content/secret`) e manda o texto de quem desbloqueou.
import { enemyKill, kills, scoreline, type MilestoneEvents } from './milestone-events.js';
import type { Achieved, Milestone, MilestoneMatch } from './milestones.js';
import type { Bilingual } from './privacy.js';

const b = (pt: string, en: string): Bilingual => ({ 'pt-BR': pt, en });

/** Contas na partida para valer um secreto (anti-farm). */
export const SECRET_MIN_ACCOUNTS = 4;
/** Janelas em décimos de segundo. */
export const ACE_WINDOW = 200;
export const KINGSLAYER_WINDOW = 100;
export const KINGSLAYER_CARRIERS = 3;
export const LONG_HAUL = 1200;
export const BUZZER = 30;
/** Horas (America/Sao_Paulo) da Coruja: [início, fim). */
export const NIGHT_OWL_HOURS = [3, 5] as const;

/** Ids estáveis (gravados no banco): nunca renomear. */
export const SECRET_MILESTONES: readonly Milestone[] = [
  { id: 'secret_ace', group: 'secret', name: b('Ás', 'Ace'), description: b('Matou todos os adversários em sequência, sem morrer', 'Killed every opponent in a row without dying') },
  { id: 'secret_mutual', group: 'secret', name: b('Empate técnico', 'Mutual destruction'), description: b('Você e um adversário se mataram no mesmo instante', 'You and an opponent killed each other at the same instant') },
  { id: 'secret_pacifist', group: 'secret', name: b('Pacifista', 'Pacifist'), description: b('Venceu com 2 capturas ou mais e nenhum kill', 'Won with 2 or more captures and no kills') },
  { id: 'secret_perfect_hat_trick', group: 'secret', name: b('Hat-trick perfeito', 'Perfect hat-trick'), description: b('3 capturas numa partida sem morrer', '3 captures in a match without dying') },
  { id: 'secret_underdog', group: 'secret', name: b('Davi contra Golias', 'David vs Goliath'), description: b('Venceu uma ranqueada com o time desfalcado', 'Won a ranked match short-handed') },
  { id: 'secret_long_haul', group: 'secret', name: b('Viagem longa', 'Long haul'), description: b('2 minutos ou mais com a bandeira até capturar', '2 minutes or more carrying the flag before capturing') },
  { id: 'secret_buzzer', group: 'secret', name: b('No apagar das luzes', 'Buzzer beater'), description: b('Captura que desempatou a partida nos últimos 3 segundos', 'Tie-breaking capture in the last 3 seconds') },
  { id: 'secret_kingslayer', group: 'secret', name: b('Caçador de reis', 'Kingslayer'), description: b('Matou 3 portadores de bandeira em 10 segundos', 'Killed 3 flag carriers within 10 seconds') },
  { id: 'secret_roadkill', group: 'secret', name: b('Atropelamento', 'Roadkill'), description: b('Matou um adversário por colisão', 'Killed an opponent by collision') },
  { id: 'secret_night_owl', group: 'secret', name: b('Coruja', 'Night owl'), description: b('Terminou uma partida entre 3h e 5h da manhã (horário de Brasília)', 'Finished a match between 3 and 5 a.m. (Brasília time)') },
  // humor (OG-399)
  { id: 'secret_seven_one', group: 'secret', name: b('E lá vem eles de novo', 'Here they come again'), description: b('Numa ranqueada, seu time chegou a estar perdendo de 7 a 1', 'In a ranked match, your team was losing 7 to 1') },
  { id: 'secret_seven_one_comeback', group: 'secret', name: b('Revanche do Mineirão', 'Mineirão revenge'), description: b('Venceu uma ranqueada depois de estar perdendo de 7 a 1', 'Won a ranked match after losing 7 to 1') },
  { id: 'secret_choked', group: 'secret', name: b('Amarelou', 'Choked'), description: b('Perdeu uma série md5 depois de estar 2 a 0', 'Lost a best-of-5 series after leading 2 to 0') },
  { id: 'secret_series_comeback', group: 'secret', name: b('Virada histórica', 'Historic comeback'), description: b('Perdeu os dois primeiros jogos de uma série md5 e venceu por 3 a 2', 'Lost the first two games of a best-of-5 series and won 3 to 2') },
];

/** Placar do 7x1 (OG-399): time da conta com 1, adversário com 7. */
export const SEVEN_ONE = { own: 1, other: 7 } as const;
const sevenOne = (e: MilestoneEvents, team: number) => scoreline(e, team).some((s) => s.own === SEVEN_ONE.own && s.other === SEVEN_ONE.other);

const myKills = (e: MilestoneEvents) => {
  const me = new Set(e.me);
  return kills(e).filter((k) => me.has(k.killer) && enemyKill(e, k));
};

/** Todos os adversários (3 ou mais índices do outro time) mortos numa vida, dentro de `ACE_WINDOW`. */
function ace(e: MilestoneEvents, team: number): boolean {
  const enemies = new Set(e.teams.flatMap((t, i) => (t >= 0 && t !== team ? [i] : [])));
  if (enemies.size < 3) return false;
  const me = new Set(e.me);
  let life: { t: number; victim: number }[] = [];
  for (const k of kills(e)) {
    if (me.has(k.victim)) life = [];
    if (!me.has(k.killer) || !enemyKill(e, k)) continue;
    life = life.filter((x) => k.t - x.t <= ACE_WINDOW);
    life.push({ t: k.t, victim: k.victim });
    if (new Set(life.map((x) => x.victim)).size >= enemies.size) return true;
  }
  return false;
}

function mutual(e: MilestoneEvents): boolean {
  const me = new Set(e.me);
  const all = kills(e);
  return all.some((k) => me.has(k.killer) && enemyKill(e, k) && all.some((o) => o.t === k.t && o.killer === k.victim && me.has(o.victim)));
}

/** Pegou e capturou sem largar no meio, com `LONG_HAUL` ou mais entre os dois. */
function longHaul(e: MilestoneEvents): boolean {
  const me = new Set(e.me);
  let since: number | null = null;
  for (const x of e.log) {
    if (x[1] === 'kill' || !me.has(x[2])) continue;
    if (x[1] === 'take') since ??= x[0];
    else if (x[1] === 'drop') since = null;
    else if (x[1] === 'capture') {
      if (since !== null && x[0] - since >= LONG_HAUL) return true;
      since = null;
    }
  }
  return false;
}

/** Captura da conta que desempatou nos últimos `BUZZER` décimos (`end` = fim da partida em décimos). */
function buzzer(e: MilestoneEvents, team: number, end: number): boolean {
  const me = new Set(e.me);
  let own = 0;
  let other = 0;
  for (const x of e.log) {
    if (x[1] !== 'capture') continue;
    const tied = own === other;
    if (e.teams[x[2]] === team) own++;
    else other++;
    if (tied && me.has(x[2]) && x[0] >= end - BUZZER) return true;
  }
  return false;
}

function kingslayer(e: MilestoneEvents): boolean {
  const carriers = myKills(e).filter((k) => k.carrier);
  return carriers.some((k, i) => carriers.slice(i).filter((o) => o.t - k.t <= KINGSLAYER_WINDOW).length >= KINGSLAYER_CARRIERS);
}

const stat = (m: MilestoneMatch, key: string): number => m.stats?.[key] ?? 0;

const SECRET_FEATS: Readonly<Record<string, (m: MilestoneMatch) => boolean>> = {
  secret_ace: (m) => m.events !== undefined && m.team !== undefined && ace(m.events, m.team),
  secret_mutual: (m) => m.events !== undefined && mutual(m.events),
  secret_pacifist: (m) => m.result > 0 && m.captures >= 2 && m.kills === 0 && m.stats !== undefined && stat(m, 'botKills') === 0,
  secret_perfect_hat_trick: (m) => m.captures >= 3 && m.deaths === 0,
  secret_underdog: (m) => m.ranked === true && m.result > 0 && m.shortHanded === true,
  secret_long_haul: (m) => m.events !== undefined && longHaul(m.events),
  secret_buzzer: (m) => m.result > 0 && m.events !== undefined && m.team !== undefined && m.endTime !== undefined && buzzer(m.events, m.team, m.endTime),
  secret_kingslayer: (m) => m.events !== undefined && kingslayer(m.events),
  secret_roadkill: (m) => m.events !== undefined && myKills(m.events).some((k) => k.cause === 'collision'),
  secret_seven_one: (m) => m.ranked === true && m.events !== undefined && m.team !== undefined && sevenOne(m.events, m.team),
  secret_seven_one_comeback: (m) => m.ranked === true && m.result > 0 && m.events !== undefined && m.team !== undefined && sevenOne(m.events, m.team),
  secret_night_owl: (m) => m.hour !== undefined && m.hour >= NIGHT_OWL_HOURS[0] && m.hour < NIGHT_OWL_HOURS[1],
};

/** Secretos que o histórico concede; só em partidas com `SECRET_MIN_ACCOUNTS` contas ou mais. */
export function secretMilestonesFrom(matches: readonly MilestoneMatch[]): Achieved[] {
  const found = new Map<string, Achieved>();
  const give = (id: string, m: MilestoneMatch) => {
    if (!found.has(id)) found.set(id, { id, matchId: m.matchId, endedAt: m.endedAt });
  };
  // séries md5 (OG-399): placar jogo a jogo do ponto de vista da conta
  const series = new Map<string, { results: number[]; done: boolean }>();
  for (const m of matches) {
    if ((m.accounts ?? 0) < SECRET_MIN_ACCOUNTS) continue;
    if (m.series && m.series.bestOf === 5) {
      const s = series.get(m.series.id) ?? { results: [], done: false };
      series.set(m.series.id, s);
      if (!s.done && m.result !== 0) {
        s.results.push(m.result);
        const wins = s.results.filter((r) => r > 0).length;
        const losses = s.results.length - wins;
        if (wins === 3 || losses === 3) {
          s.done = true;
          const [a, b2] = s.results;
          if (losses === 3 && a! > 0 && b2! > 0) give('secret_choked', m);
          if (wins === 3 && a! < 0 && b2! < 0) give('secret_series_comeback', m);
        }
      }
    }
    for (const [id, feat] of Object.entries(SECRET_FEATS)) if (!found.has(id) && feat(m)) give(id, m);
  }
  const order = new Map(SECRET_MILESTONES.map((x, i) => [x.id, i]));
  return [...found.values()].sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
}

export const isSecretMilestone = (id: string): boolean => id.startsWith('secret_');
