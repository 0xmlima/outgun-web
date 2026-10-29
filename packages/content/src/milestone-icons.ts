// SPDX-License-Identifier: GPL-2.0-or-later
// Ícones dos marcos (OG-395): SVG gerado do catálogo, o mesmo no perfil (OG-393) e nos PNGs da Steam
// (tools/visual-compare/milestone-icons.mjs). Moldura na cor do grupo, anel de nível nos marcos de
// total (bronze, prata, ouro pela ordem do alvo no mesmo contador) e o símbolo no centro, com o
// traço dos ícones dos menus (OG-291). Os símbolos dos secretos ficam no módulo dos secretos.
import { MILESTONE_TOTALS, MILESTONES, type MilestoneGroup } from './milestones.js';

/** Símbolos em grade de 24×24, traço de 2 px (como `apps/web/src/ui/icons.tsx`). */
export const MILESTONE_SYMBOLS = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H3.5v1.5A3.5 3.5 0 0 0 7 11M17 6h3.5v1.5A3.5 3.5 0 0 1 17 11M12 14v4M8 21h8M9 18h6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.5l3.5 2"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5"/><path d="M4 10h16M8.5 3v4.5M15.5 3v4.5"/>',
  map: '<path d="M3 4h7v6.5M14 4h7v7M3 14v6h7M21 14v6h-7M3 4v6M10 14v6M14 14h7"/>',
  flag: '<path d="M6 21V3"/><path d="M7 4h11v8H7" fill="currentColor" fill-opacity=".25"/>',
  flags: '<path d="M5 21V4M13 21V9"/><path d="M6 5h7v5H6M14 10h7v5h-7" fill="currentColor" fill-opacity=".25"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.5 3 8 7 9.5 4-1.5 7-5 7-9.5V6z"/>',
  crosshair: '<circle cx="12" cy="12" r="7.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  flame: '<path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.6 2.8-5.6 3.8-9.3 1.7 1.3 2.7 3 2.7 5 1-.8 1.7-2 1.9-3.4 2.4 2 4.6 4.6 4.6 7.7 0 3.5-2.5 6.2-6.5 6.2z"/>',
  bolt: '<path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6z"/>',
  skull: '<path d="M5 11a7 7 0 0 1 14 0v3.5l-2 1V20H7v-4.5l-2-1z"/><circle cx="9" cy="11.5" r="1.6" fill="currentColor"/><circle cx="15" cy="11.5" r="1.6" fill="currentColor"/><path d="M11 20v-2.5M13 20v-2.5"/>',
  player: '<circle cx="10" cy="13" r="6"/><path d="M14.2 8.8 20 3"/>',
  players: '<circle cx="8" cy="14" r="4.5"/><circle cx="16.5" cy="9.5" r="4.5"/><path d="M11 10.8l2.2-1.3"/>',
  clan: '<path d="M4 4h16v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11z"/><path d="M8 9h8M8 13h8"/>',
  star: '<path d="m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8z"/>',
  medal: '<circle cx="12" cy="15" r="5.5"/><path d="M8.5 3 12 9.5 15.5 3M12 13v4"/>',
  laugh: '<circle cx="12" cy="12" r="8.5"/><path d="M8 9.5h1.5M14.5 9.5H16M7.5 13.5h9a4.5 4.5 0 0 1-9 0z"/>',
  question: '<path d="M8.5 9a3.5 3.5 0 1 1 5.2 3c-1.1.6-1.7 1.3-1.7 2.5V16"/><circle cx="12" cy="19.5" r="1" fill="currentColor"/>',
} as const;
export type MilestoneSymbol = keyof typeof MILESTONE_SYMBOLS;

/** Cor da moldura por grupo (fixa: o PNG da Steam não lê os tokens do cliente). */
export const MILESTONE_GROUP_COLORS: Readonly<Record<MilestoneGroup, string>> = {
  progress: '#5cc8ff',
  flag: '#e8c14a',
  defense: '#6fd38a',
  combat: '#ff6b5c',
  ranked: '#b48cff',
  social: '#4fd1c5',
  clan: '#f59e5b',
  humor: '#ff8fc7',
  secret: '#ffd35c',
};
export const MILESTONE_TIER_COLORS = ['#c07a45', '#c9d1d9', '#ffd35c'] as const;

/** Símbolo de cada marco público; o que faltar cai no do grupo (o teste exige todos aqui). */
export const MILESTONE_ICON_SYMBOLS: Readonly<Record<string, MilestoneSymbol>> = {
  first_match: 'play', matches_10: 'play', matches_100: 'play', matches_1000: 'play',
  wins_1: 'trophy', wins_100: 'trophy', wins_500: 'trophy', win_streak_10: 'bolt',
  hours_10: 'clock', hours_100: 'clock', days_7: 'calendar', maps_10: 'map', maps_25: 'map',
  first_capture: 'flag', captures_50: 'flag', captures_250: 'flag', hat_trick: 'flags', returns_100: 'flag', carry_60: 'clock', wild_flag: 'flags',
  defenses_match_10: 'shield', defenses_250: 'shield', carriers_match_5: 'crosshair', shutout: 'shield',
  kills_100: 'crosshair', kills_1000: 'crosshair', kills_10000: 'crosshair', accuracy_50: 'crosshair', accuracy_70: 'crosshair',
  streak_10: 'flame', streak_20: 'flame', kills_match_30: 'skull', flawless: 'star', multi_kill: 'bolt', triple_kill: 'bolt',
  deathbringer_1: 'skull', deathbringer_50: 'skull', trades_50: 'players', first_kills_50: 'bolt', assists_100: 'players', enemy_base_kills_100: 'flag',
  ranked_first: 'medal', ranked_win: 'medal', ranked_wins_100: 'medal', win_2x2: 'players', win_3x3: 'players', win_4x4: 'players', win_5x5: 'players',
  series_bo5: 'trophy', season_champion: 'trophy', comeback: 'bolt',
  beta: 'star', duo_50: 'players',
  humor_today_yes: 'flag', humor_customer: 'skull', humor_butterfingers: 'flag', humor_ball_hog: 'player', humor_punching_bag: 'skull', humor_sightseeing: 'map', humor_runner_up: 'medal',
  clan_war: 'clan', clan_war_win: 'clan', clan_war_10: 'clan', clan_war_wins_10: 'clan', clan_series_win: 'trophy', clan_sweep: 'trophy', clan_rivalry_5: 'players', clan_defender: 'shield',
};

const GROUP_SYMBOL: Readonly<Record<MilestoneGroup, MilestoneSymbol>> = {
  progress: 'play', flag: 'flag', defense: 'shield', combat: 'crosshair', ranked: 'medal', social: 'players', clan: 'clan', humor: 'laugh', secret: 'star',
};

/** Nível 0/1/2 (bronze/prata/ouro) dos marcos de total, pela ordem do alvo no mesmo contador. */
export function milestoneTier(id: string): number | null {
  const own = MILESTONE_TOTALS[id];
  if (!own) return null;
  const targets = [...new Set(Object.values(MILESTONE_TOTALS).filter((t) => t.counter === own.counter).map((t) => t.target))].sort((a, b) => a - b);
  if (targets.length < 2) return null;
  const i = targets.indexOf(own.target);
  return Math.min(2, Math.round((i / (targets.length - 1)) * 2));
}

export interface MilestoneIconSpec {
  group: MilestoneGroup;
  symbol: MilestoneSymbol;
  tier: number | null;
}

export function milestoneIconSpec(id: string, group: MilestoneGroup, symbol?: MilestoneSymbol): MilestoneIconSpec {
  return { group, symbol: symbol ?? MILESTONE_ICON_SYMBOLS[id] ?? GROUP_SYMBOL[group], tier: milestoneTier(id) };
}

/** Ícone do marco público pelo id (o perfil usa o genérico dos secretos). */
export function publicMilestoneIcon(id: string): MilestoneIconSpec | null {
  const m = MILESTONES.find((x) => x.id === id);
  return m ? milestoneIconSpec(m.id, m.group) : null;
}

/** Ícone genérico dos secretos no cliente: estrela (desbloqueado) ou interrogação (bloqueado). */
export const secretMilestoneIcon = (unlocked: boolean): MilestoneIconSpec => ({ group: 'secret', symbol: unlocked ? 'star' : 'question', tier: null });

/** SVG 256×256 do ícone; `locked` = cinza (o estado bloqueado da Steam e do perfil). */
export function milestoneIconSvg(spec: MilestoneIconSpec, o: { locked?: boolean } = {}): string {
  const color = o.locked ? '#6b7280' : MILESTONE_GROUP_COLORS[spec.group];
  const ring = spec.tier === null ? color : o.locked ? '#4b5563' : MILESTONE_TIER_COLORS[spec.tier]!;
  const bg = o.locked ? '#16191d' : '#101a12';
  const secret = spec.group === 'secret';
  // moldura: quadrado com cantos cortados; secretos em losango
  const frame = secret ? '<path d="M128 14 242 128 128 242 14 128z"/>' : '<path d="M44 14h168l30 30v168l-30 30H44l-30-30V44z"/>';
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">',
    `<rect width="256" height="256" fill="${bg}"/>`,
    `<g fill="none" stroke="${ring}" stroke-width="10" stroke-linejoin="miter">${frame}</g>`,
    `<g fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="miter" opacity=".55" transform="translate(128 128) scale(.84) translate(-128 -128)">${frame}</g>`,
    `<g fill="none" stroke="${color}" color="${color}" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" transform="translate(56 56) scale(6)">${MILESTONE_SYMBOLS[spec.symbol]}</g>`,
    '</svg>',
  ].join('');
}
