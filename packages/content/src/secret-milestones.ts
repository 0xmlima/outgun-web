// SPDX-License-Identifier: GPL-2.0-or-later
// Marcos secretos (OG-398, RN-SOC-06). Ficam fora do `index.ts` de propósito: o cliente importa o
// catálogo de `@outgun/content` e não pode receber nome nem condição de um secreto que o jogador
// não tem. Só a API importa este módulo (`@outgun/content/secret`) e manda o texto de quem desbloqueou.
import { enemyKill, kills, type MilestoneEvents } from './milestone-events.js';
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
];

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
  secret_night_owl: (m) => m.hour !== undefined && m.hour >= NIGHT_OWL_HOURS[0] && m.hour < NIGHT_OWL_HOURS[1],
};

/** Secretos que o histórico concede; só em partidas com `SECRET_MIN_ACCOUNTS` contas ou mais. */
export function secretMilestonesFrom(matches: readonly MilestoneMatch[]): Achieved[] {
  const found = new Map<string, Achieved>();
  for (const m of matches) {
    if ((m.accounts ?? 0) < SECRET_MIN_ACCOUNTS) continue;
    for (const [id, feat] of Object.entries(SECRET_FEATS)) if (!found.has(id) && feat(m)) found.set(id, { id, matchId: m.matchId, endedAt: m.endedAt });
  }
  const order = new Map(SECRET_MILESTONES.map((x, i) => [x.id, i]));
  return [...found.values()].sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
}

export const isSecretMilestone = (id: string): boolean => id.startsWith('secret_');
