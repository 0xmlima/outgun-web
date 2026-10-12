// SPDX-License-Identifier: GPL-2.0-or-later
// Tempo até impacto de um círculo em movimento contra ponto, segmento e arco
// (`bounceFromPoint`, `bounceFromLine`, `bounceFromArc`, src/world.cpp:943-1067).
// Coordenadas relativas ao centro do círculo no início do movimento; o tempo é medido em
// "quantas vezes o vetor de movimento m" (1 = um frame inteiro).
import { dot, Vec } from './vec.js';

/** Sem impacto (o original usa 1e99). */
export const NO_HIT = 1e99;

/** `BounceData`: tempo do impacto e vetor do centro do círculo até o ponto de contato. */
export interface BounceData {
  time: number;
  /** Ponto de contato − centro no momento do impacto (comprimento = raio do círculo). */
  contact: Vec;
}

export const noBounce = (): BounceData => ({ time: NO_HIT, contact: new Vec(0, 0) });

/** |t·m − d| = r: menor t ≥ 0 em que o círculo de raio r toca o ponto d. */
export function bounceFromPoint(d: Vec, m: Vec, r: number): BounceData {
  const m2 = m.mag2();
  const mdotd = dot(m, d);
  const disc = mdotd * mdotd - m2 * (d.mag2() - r * r);
  if (disc >= 0) {
    const t = (mdotd - Math.sqrt(disc)) / m2; // a menor solução (a maior é afastando-se)
    if (t >= 0) return { time: t, contact: d.sub(m.mul(t)) };
  }
  return noBounce();
}

/** Impacto no interior do segmento d1-d2 (as pontas ficam para `bounceFromPoint`). */
export function bounceFromLine(d1: Vec, d2: Vec, m: Vec, r: number): BounceData {
  const diff = d2.sub(d1);
  const div = m.x * diff.y - m.y * diff.x;
  if (div !== 0) {
    // div == 0: movimento paralelo à reta, sem impacto
    const rBase = (d1.x * diff.y - d1.y * diff.x) / div;
    const rAdd = (r * diff.mag()) / div;
    const t = rBase - Math.abs(rAdd);
    if (t >= 0) {
      // ponto da reta mais próximo do centro: d1 + k·diff, com 0 ≤ k ≤ 1 se estiver no segmento
      const k = dot(diff, m.mul(t).sub(d1)) / diff.mag2();
      if (k >= 0 && k <= 1) return { time: t, contact: d1.add(diff.mul(k)).sub(m.mul(t)) };
    }
  }
  return noBounce();
}

/**
 * Impacto em arco de raio `ar` centrado em d, limitado ao ângulo em torno de `av` com cosseno da
 * meia-abertura `ahwcos`. `outside`: batendo por fora (ar + cr) ou por dentro (ar − cr).
 * `av` está em coordenadas "de mapa" (y invertido), por isso o produto escalar usa −y.
 */
export function bounceFromArc(d: Vec, m: Vec, av: Vec, ahwcos: number, ar: number, cr: number, outside: boolean): BounceData {
  const bounceRad = ar + (outside ? cr : -cr);
  const m2 = m.mag2();
  const r2 = bounceRad * bounceRad;
  const mdotd = dot(m, d);
  const d2 = d.mag2();
  const disc = mdotd * mdotd - m2 * (d2 - r2);
  if (disc >= 0) {
    const t = outside ? (mdotd - Math.sqrt(disc)) / m2 : (mdotd + Math.sqrt(disc)) / m2;
    if (t >= 0) {
      const diff = m.mul(t).sub(d);
      const along = diff.x * av.x - diff.y * av.y;
      if (along >= ahwcos * bounceRad) {
        const mul = (ar - bounceRad) / bounceRad;
        return { time: t, contact: diff.mul(mul) };
      }
    }
  }
  return noBounce();
}

/**
 * Tempo até um jogador (pos/vel `a`) e um foguete (pos/vel `b`) ficarem a `collRadius` de distância
 * (`WorldBase::getTimeTillCollision(PlayerBase, Rocket)`). Já sobrepostos: 0.
 */
export function timeTillPlayerRocketCollision(aPos: Vec, aVel: Vec, bPos: Vec, bVel: Vec, collRadius: number): number {
  return timeTillCircleCollision(aPos, aVel, bPos, bVel, collRadius, 0);
}

/**
 * Tempo até dois jogadores ficarem a `collRadius` de distância
 * (`WorldBase::getTimeTillCollision(PlayerBase, PlayerBase)`). Já sobrepostos: sem colisão.
 */
export function timeTillPlayerPlayerCollision(aPos: Vec, aVel: Vec, bPos: Vec, bVel: Vec, collRadius: number): number {
  return timeTillCircleCollision(aPos, aVel, bPos, bVel, collRadius, NO_HIT);
}

function timeTillCircleCollision(aPos: Vec, aVel: Vec, bPos: Vec, bVel: Vec, collRadius: number, ifOverlapping: number): number {
  const d = bPos.sub(aPos);
  const r2 = collRadius * collRadius;
  if (d.mag2() < r2) return ifOverlapping;
  const m = aVel.sub(bVel);
  const m2 = m.mag2();
  const mdotd = dot(m, d);
  const d2 = d.mag2();
  const disc = mdotd * mdotd - m2 * (d2 - r2);
  if (disc >= 0) {
    const t = (mdotd - Math.sqrt(disc)) / m2;
    if (t >= 0) return t;
  }
  return NO_HIT;
}
