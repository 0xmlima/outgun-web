// SPDX-License-Identifier: GPL-2.0-or-later
// Cor do clã na tela (OG-409, RN-CLA-09): quando um lado vira o clã (`teamIdentity`, OG-408), as
// cores do tema daquele lado (boneco, bandeira, foguete, escudo, mira, placar, minimapa...) passam
// a sair da cor do clã, com os tons claro, escuro e de piscar derivados dela. Sem identidade, ou
// sem cor (as duas do clã colidiam), o lado fica com as do tema.

type Rgb = [number, number, number];
const parse = (hex: string): Rgb => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const hex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
/** Mistura `c` com `to` (0 = c, 1 = to). */
const mix = (c: Rgb, to: Rgb, k: number): Rgb => [c[0] + (to[0] - c[0]) * k, c[1] + (to[1] - c[1]) * k, c[2] + (to[2] - c[2]) * k];
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** Chaves do tema de cada lado e o tom de cada uma a partir da cor do clã. */
const TEAM_KEYS: readonly [string, (c: Rgb) => Rgb][] = [
  ['team_{}_basic', (c) => c],
  ['team_{}_light', (c) => mix(c, WHITE, 0.3)],
  ['team_{}_dark', (c) => mix(c, BLACK, 0.6)],
  ['team_{}_flash', (c) => mix(c, WHITE, 0.78)],
  ['aim_line_{}team', (c) => mix(c, WHITE, 0.1)],
  ['aim_dot_{}team', (c) => c],
  ['scoreboard_bg_{}team', (c) => mix(c, BLACK, 0.9)],
  ['deathbringer_smoke_{}', (c) => mix(c, BLACK, 0.87)],
];
const SIDE = ['red', 'blue'] as const;

/** As cores do tema que mudam para o lado `team` com a cor `colour` do clã. */
export function teamColourOverrides(team: 0 | 1, colour: string): Record<string, string> {
  const c = parse(colour);
  return Object.fromEntries(TEAM_KEYS.map(([key, tone]) => [key.replace('{}', SIDE[team]), hex(tone(c))]));
}

/**
 * Aplica a identidade dos dois lados em `live` (as cores que os renderizadores leem), partindo das
 * do tema em `base`; devolve se alguma cor mudou (para refazer as texturas).
 */
export function applyTeamColours(live: Record<string, string>, base: Readonly<Record<string, string>>, colours: readonly [string | null, string | null]): boolean {
  let changed = false;
  for (const team of [0, 1] as const) {
    const keys = TEAM_KEYS.map(([key]) => key.replace('{}', SIDE[team]));
    const next = colours[team] ? teamColourOverrides(team, colours[team]) : Object.fromEntries(keys.map((k) => [k, base[k]]));
    for (const k of keys) {
      const v = next[k];
      if (v === undefined || live[k] === v) continue;
      live[k] = v;
      changed = true;
    }
  }
  return changed;
}
