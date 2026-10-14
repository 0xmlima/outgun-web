// SPDX-License-Identifier: GPL-2.0-or-later
// O que o renderer de entidades desenha num quadro (independente de onde vem: servidor, replay ou
// sim local) e as regras puras do original para cores, alfas e animações
// (plan/specs/render-entidades.md).
import type { WorldCoords } from '@outgun/sim';

export interface PlayerView {
  readonly pid: number;
  readonly team: 0 | 1;
  /** Cor pessoal 0..15; 16 = desconhecida (`player_unknown`). */
  readonly color: number;
  readonly name: string;
  readonly pos: WorldCoords;
  /** Direção da arma em oitavos (0 = direita, sentido horário); −1 = sem direção. */
  readonly gundir: number;
  readonly dead: boolean;
  /** Fim do pisca de acerto (tempo em s); 0 = sem acerto recente. */
  readonly hitfx: number;
  readonly power: boolean;
  /** Turbo ativo e acima da velocidade máxima de corrida (gera rastro). */
  readonly turboTrail: boolean;
  readonly shield: boolean;
  readonly deathbringer: boolean;
  readonly deathbringerAffected: boolean;
  /** Alfa final 0..255 (`calculatePlayerAlpha`). */
  readonly alpha: number;
  readonly frags: number;
  readonly me: boolean;
  /** Segundos até renascer (só o próprio jogador morto); 0 = não mostra. */
  readonly respawnIn: number;
}

export interface RocketView {
  readonly team: 0 | 1;
  readonly power: boolean;
  readonly pos: WorldCoords;
  /** Direção em oitavos. */
  readonly direction: number;
  readonly shadow: boolean;
}

export interface PowerupView {
  /** `PowerupKind` 0..6 (shield, turbo, shadow, power, weapon, megahealth, deathbringer). */
  readonly kind: number;
  readonly pos: WorldCoords;
}

export interface FlagView {
  /** 0 vermelha, 1 azul, 2 neutra. */
  readonly team: 0 | 1 | 2;
  readonly pos: WorldCoords;
  /** Pid do portador; −1 se está no chão. */
  readonly carrier: number;
  readonly flash: boolean;
  /** Segundos até voltar à base (mostrado se ≥ 3). */
  readonly returnIn: number;
}

export interface DeathbringerView {
  readonly pos: WorldCoords;
  readonly team: 0 | 1;
  /** Raio atual em unidades do mundo (`DeathbringerExplosion::radius`). */
  readonly radius: number;
}

export interface EntityFrame {
  /** Tempo do jogo em segundos (`frame / 10`, interpolado entre quadros). */
  readonly time: number;
  readonly players: readonly PlayerView[];
  readonly rockets: readonly RocketView[];
  readonly powerups: readonly PowerupView[];
  readonly flags: readonly FlagView[];
  readonly deathbringers: readonly DeathbringerView[];
  /** Mais de uma sala na tela (ênfase das bandeiras na opção "multi-roomed"). */
  readonly multiRoom: boolean;
  /**
   * Bandeiras carregadas por quem saiu da vista, onde foram vistas por último, com os segundos sem
   * notícia (opção "Show flag disappearance positions", OG-070).
   */
  readonly oldFlags?: readonly { readonly team: 0 | 1 | 2; readonly pos: WorldCoords; readonly unknownFor: number }[];
}

/** Efeitos criados por eventos (`create_*`). */
export type EffectKind = 'gunExplosion' | 'wallExplosion' | 'powerWallExplosion';

export const PLAYER_RADIUS = 15;
export const GUNPOINT_RADIUS = 28;
export const ROCKET_RADIUS = 4;
export const POWER_ROCKET_RADIUS = 6;
export const SHIELD_RADIUS_ADD = 9;
/** Lados dos sprites no mundo (src/graphics.h:92-99). */
export const PLAYER_SPRITE_SIZE = 60;
export const ROCKET_SPRITE_SIZE = 16;
export const FLAG_SPRITE_SIZE = 100;
export const ITEM_SPRITE_SIZE = 30;

const clamp255 = (v: number) => Math.max(0, Math.min(255, v));

/** `#RRGGBB` → [r, g, b]. */
export function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hex([r, g, b]: readonly [number, number, number]): string {
  return `#${((1 << 24) | (clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b)).toString(16).slice(1)}`;
}

/** Cor do jogador acertado: `player_hit + int(Δ·600)` por canal (`draw_player`). */
export function hitColour(playerHit: string, hitfx: number, time: number): string | null {
  const delta = hitfx - time;
  if (delta <= 0) return null;
  const add = Math.trunc(delta * 600);
  const [r, g, b] = rgb(playerHit);
  return hex([r + add, g + add, b + add]);
}

/** Décimos ímpares de segundo: cores e sprite de power (`int(fmod(t·10, 2))`). */
export function powerBlink(time: number): boolean {
  return Math.trunc((time * 10) % 2) === 1;
}

/** Alternância a cada 1/30 s (foguete power e item power). */
export function blink30(time: number): boolean {
  return Math.trunc((time * 30) % 2) === 1;
}

/** Bandeira devolvida pisca nos 2 s seguintes quando `int(fmod(t·15, 3)) == 0`. */
export function flagFlash(time: number, returnTime: number): boolean {
  return time < returnTime + 2 && Math.trunc((time * 15) % 3) === 0;
}

/** Alfa do item shadow: 55 + triângulo 0..200 (`draw_pup_shadow`). */
export function shadowItemAlpha(time: number): number {
  let a = Math.trunc((time * 600) % 400);
  if (a > 200) a = 400 - a;
  return 55 + a;
}

/** Variação 0..5 do tamanho do megahealth (`draw_pup_health`). */
export function healthVariation(time: number): number {
  let v = Math.trunc((time * 15) % 10);
  if (v > 5) v = 10 - v;
  return v;
}

/** Ângulo (rad) do item arma no instante: uma volta por segundo. */
export function weaponItemAngle(time: number, ball: number): number {
  return (Math.trunc((time * 1000) % 1000) / 1000) * 2 * Math.PI + (Math.PI / 2) * ball;
}

/** Fumaça do deathbringer: alfa `int((120 − Δ·200)·alfa)` e raio `3 + 9·(0,6 − Δ)` (unidades do mundo). */
export function smoke(delta: number, alpha: number): { alpha: number; radius: number; rise: number } {
  const radius = 3 + 9 * (0.6 - delta);
  return { alpha: Math.trunc((120 - delta * 200) * alpha), radius, rise: 96 - radius * 8 };
}

/** Brilho do anel do deathbringer a `r` px da borda interna (`DeathbringerColorizer`). */
export function deathbringerBrightness(r: number, scale: number): number {
  const rMid = Math.trunc(scale * 30);
  return r < rMid ? 14 + Math.trunc((8 / scale) * r) : 255 - Math.trunc((14 / scale) * (r - rMid));
}

/** Alfa do anel do portador a `dist` do centro, num disco de lado `size` (`make_db_effect`). */
export function carrierCircleAlpha(dist: number, size: number): number {
  return Math.max(0, Math.trunc(230 - (dist * 2 * 230) / size));
}

/** Ângulo (rad, 0 = direita, horário) da direção em oitavos (`GunDirection::toRad`). */
export function gunAngle(gundir: number): number {
  return (gundir * Math.PI) / 4;
}

/** Cor aleatória entre metade da cor do time e o branco (`draw_gun_explosion`). */
export function explosionColour(team: string, random: () => number): string {
  const c = rgb(team).map((v) => Math.trunc(random() * (256 - Math.trunc(v / 2))) + Math.trunc(v / 2)) as [number, number, number];
  return hex(c);
}
