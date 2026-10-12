// SPDX-License-Identifier: GPL-2.0-or-later
// Paredes e áreas de chão do mapa (src/world.h:96-169, src/world.cpp:60-290, 1069-1161):
// construção, testes de interseção (validação de mapas, spawns, power-ups) e o quique contínuo
// (`tryBounce`: tempo até um círculo em movimento tocar a parede).
import { N_PI } from '../constants.js';
import { bounceFromArc, bounceFromLine, bounceFromPoint, type BounceData } from '../geometry/bounce.js';
import { cross, dot, Vec } from '../geometry/vec.js';

/** `add_rv()` do original: só troca por um impacto estritamente mais cedo. */
const earlier = (best: BounceData, candidate: BounceData): BounceData => (candidate.time < best.time ? candidate : best);

export type WallKind = 'rect' | 'tri' | 'circ';

interface WallCommon {
  readonly kind: WallKind;
  /** ID de textura, 0 a 7 (doc/maps.html). Não afeta a física. */
  readonly texture: number;
  /** Opacidade 0 a 255 (extensão do formato; 255 se omitida). */
  readonly alpha: number;
  intersectsRect(x1: number, y1: number, x2: number, y2: number): boolean;
  intersectsCirc(center: Vec, r: number): boolean;
  /**
   * Devolve `best` ou um impacto mais cedo do círculo de raio `plyRadius` que parte de `st` com
   * movimento `m` (`WallBase::tryBounce`).
   */
  tryBounce(best: BounceData, st: Vec, m: Vec, plyRadius: number): BounceData;
}

export type Wall = RectWall | TriWall | CircWall;

/** Parede retangular; os cantos são normalizados para (a, b) ≤ (c, d). */
export class RectWall implements WallCommon {
  readonly kind = 'rect';
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;

  constructor(
    a: number,
    b: number,
    c: number,
    d: number,
    readonly texture: number,
    readonly alpha: number,
  ) {
    [this.a, this.c] = c < a ? [c, a] : [a, c];
    [this.b, this.d] = d < b ? [d, b] : [b, d];
  }

  intersectsRect(x1: number, y1: number, x2: number, y2: number): boolean {
    return x1 <= this.c && x2 >= this.a && y1 <= this.d && y2 >= this.b;
  }

  intersectsCirc(center: Vec, r: number): boolean {
    const { a, b, c, d } = this;
    if (center.x - r <= c && center.x + r >= a && center.y - r <= d && center.y + r >= b) {
      if (center.x >= a && center.x <= c) return true;
      if (center.y >= b && center.y <= d) return true;
      // Cantos.
      const r2 = r * r;
      if (center.sub(new Vec(a, b)).mag2() <= r2) return true;
      if (center.sub(new Vec(c, b)).mag2() <= r2) return true;
      if (center.sub(new Vec(a, d)).mag2() <= r2) return true;
      if (center.sub(new Vec(c, d)).mag2() <= r2) return true;
    }
    return false;
  }

  tryBounce(best: BounceData, st: Vec, m: Vec, plyRadius: number): BounceData {
    const { a, b, c, d } = this;
    // Mesma sequência do original, inclusive o reaproveitamento de `rv` entre os dois testes.
    let rv: BounceData | undefined;
    let onLine = false;
    if (m.x > 0 && a > st.x) rv = bounceFromLine(new Vec(a, b).sub(st), new Vec(a, d).sub(st), m, plyRadius);
    else if (m.x < 0 && c < st.x) rv = bounceFromLine(new Vec(c, b).sub(st), new Vec(c, d).sub(st), m, plyRadius);
    if (rv && rv.time < 1e10) {
      onLine = true;
      best = earlier(best, rv);
    }
    if (m.y > 0 && b > st.y) rv = bounceFromLine(new Vec(a, b).sub(st), new Vec(c, b).sub(st), m, plyRadius);
    else if (m.y < 0 && d < st.y) rv = bounceFromLine(new Vec(a, d).sub(st), new Vec(c, d).sub(st), m, plyRadius);
    if (rv && rv.time < 1e10) {
      onLine = true;
      best = earlier(best, rv);
    }
    if (!onLine) {
      // cantos
      best = earlier(best, bounceFromPoint(new Vec(a, b).sub(st), m, plyRadius));
      best = earlier(best, bounceFromPoint(new Vec(c, b).sub(st), m, plyRadius));
      best = earlier(best, bounceFromPoint(new Vec(a, d).sub(st), m, plyRadius));
      best = earlier(best, bounceFromPoint(new Vec(c, d).sub(st), m, plyRadius));
    }
    return best;
  }
}

/**
 * `subIntersection` (src/world.cpp:79): a área entre as retas l1-l2 e r1-r2 cruza o retângulo?
 * Todas as retas ordenadas por y, e lx(y) ≤ rx(y).
 */
function subIntersection(
  l1: Vec,
  l2: Vec,
  r1: Vec,
  r2: Vec,
  rectx1: number,
  recty1: number,
  rectx2: number,
  recty2: number,
): boolean {
  let miny = Math.max(Math.max(l1.y, r1.y), recty1);
  let maxy = Math.min(Math.min(l2.y, r2.y), recty2);
  if (maxy < miny) return false;
  // Restringe por lx(y) <= rectx2.
  if (l1.x === l2.x) {
    if (l1.x > rectx2) return false;
  } else {
    const intersectY = ((rectx2 - l1.x) * (l2.y - l1.y)) / (l2.x - l1.x) + l1.y;
    if (l2.x > l1.x) {
      if (maxy > intersectY) maxy = intersectY;
    } else if (miny < intersectY) {
      miny = intersectY;
    }
  }
  if (maxy < miny) return false;
  // Restringe por rx(y) >= rectx1.
  if (r1.x === r2.x) return r1.x >= rectx1;
  const intersectY = ((rectx1 - r1.x) * (r2.y - r1.y)) / (r2.x - r1.x) + r1.y;
  if (r2.x > r1.x) {
    if (miny < intersectY) miny = intersectY;
  } else if (maxy > intersectY) {
    maxy = intersectY;
  }
  return maxy >= miny;
}

/** Parede triangular; os vértices são ordenados por y (p1.y ≤ p2.y ≤ p3.y). */
export class TriWall implements WallCommon {
  readonly kind = 'tri';
  readonly p1: Vec;
  readonly p2: Vec;
  readonly p3: Vec;
  readonly boundX1: number;
  readonly boundY1: number;
  readonly boundX2: number;
  readonly boundY2: number;

  constructor(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    readonly texture: number,
    readonly alpha: number,
  ) {
    let p1 = new Vec(x1, y1);
    let p2 = new Vec(x2, y2);
    let p3 = new Vec(x3, y3);
    if (p2.y < p1.y) [p1, p2] = [p2, p1];
    if (p3.y < p2.y) {
      [p2, p3] = [p3, p2];
      if (p2.y < p1.y) [p1, p2] = [p2, p1];
    }
    this.p1 = p1;
    this.p2 = p2;
    this.p3 = p3;
    this.boundX1 = Math.min(p1.x, Math.min(p2.x, p3.x));
    this.boundY1 = Math.min(p1.y, Math.min(p2.y, p3.y));
    this.boundX2 = Math.max(p1.x, Math.max(p2.x, p3.x));
    this.boundY2 = Math.max(p1.y, Math.max(p2.y, p3.y));
  }

  intersectsRect(rx1: number, ry1: number, rx2: number, ry2: number): boolean {
    const { p1, p2, p3 } = this;
    if (rx1 > this.boundX2 || rx2 < this.boundX1 || ry1 > this.boundY2 || ry2 < this.boundY1) {
      return false;
    }
    // Divide o triângulo em y = p2.y e testa as bordas esquerda/direita de cada metade.
    if (p2.x < p1.x + ((p2.y - p1.y) * (p3.x - p1.x)) / (p3.y - p1.y)) {
      // p2 à esquerda da reta p1-p3
      if (subIntersection(p1, p2, p1, p3, rx1, ry1, rx2, ry2)) return true;
      if (subIntersection(p2, p3, p1, p3, rx1, ry1, rx2, ry2)) return true;
    } else {
      if (subIntersection(p1, p3, p1, p2, rx1, ry1, rx2, ry2)) return true;
      if (subIntersection(p1, p3, p2, p3, rx1, ry1, rx2, ry2)) return true;
    }
    return false;
  }

  intersectsCirc(center: Vec, r: number): boolean {
    // Teste grosseiro primeiro.
    if (!this.intersectsRect(center.x - r, center.y - r, center.x + r, center.y + r)) return false;
    const { p1, p2, p3 } = this;
    const p = [p1, p2, p3, p1] as const;
    // O círculo cruza alguma aresta?
    for (let i = 0; i < 3; i++) {
      const pi = p[i] as Vec;
      const diff = (p[i + 1] as Vec).sub(pi);
      const a = diff.mag2();
      const b = 2 * dot(diff, pi.sub(center));
      const c = center.mag2() + pi.mag2() - 2 * dot(center, pi) - r * r;
      if (b * b - 4 * a * c >= 0) {
        const d = dot(center.sub(pi), diff);
        if ((d / a >= 0 && d <= a) || pi.sub(center).mag2() <= r * r) return true;
      }
    }
    // O círculo está dentro do triângulo sem tocar as arestas?
    const bc = cross(p2, p3);
    const ca = cross(p3, p1);
    const ab = cross(p1, p2);
    const ap = cross(p1, center);
    const bp = cross(p2, center);
    const cp = cross(p3, center);
    const abc = bc + ca + ab < 0 ? -1 : 1;
    return abc * (bc - bp + cp) > 0 && abc * (ca - cp + ap) > 0 && abc * (ab - ap + bp) > 0;
  }

  tryBounce(best: BounceData, st: Vec, m: Vec, plyRadius: number): BounceData {
    const p1 = this.p1.sub(st);
    const p2 = this.p2.sub(st);
    const p3 = this.p3.sub(st);
    best = earlier(best, bounceFromLine(p1, p2, m, plyRadius));
    best = earlier(best, bounceFromLine(p1, p3, m, plyRadius));
    best = earlier(best, bounceFromLine(p2, p3, m, plyRadius));
    best = earlier(best, bounceFromPoint(p1, m, plyRadius));
    best = earlier(best, bounceFromPoint(p2, m, plyRadius));
    best = earlier(best, bounceFromPoint(p3, m, plyRadius));
    return best;
  }
}

/**
 * Parede circular: disco (ri = 0), anel (ri > 0) e/ou setor entre `angle[0]` e `angle[1]` graus
 * (0 = topo, sentido horário; ângulos iguais = círculo completo).
 */
export class CircWall implements WallCommon {
  readonly kind = 'circ';
  readonly center: Vec;
  readonly angles: readonly [number, number];
  readonly va1: Vec;
  readonly va2: Vec;
  readonly midvec: Vec;
  readonly anglecos: number;

  constructor(
    x: number,
    y: number,
    readonly ro: number,
    readonly ri: number,
    ang1: number,
    ang2: number,
    readonly texture: number,
    readonly alpha: number,
  ) {
    this.center = new Vec(x, y);
    this.angles = [ang1, ang2];
    const a1r = (ang1 * N_PI) / 180;
    const a2r = (ang2 * N_PI) / 180;
    this.va1 = new Vec(Math.sin(a1r), Math.cos(a1r));
    this.va2 = new Vec(Math.sin(a2r), Math.cos(a2r));
    const a2rGreater = a2r >= a1r ? a2r : a2r + 2 * N_PI;
    this.anglecos = a1r === a2r ? -1 : Math.cos((a2rGreater - a1r) / 2);
    const midangle = (a2rGreater + a1r) / 2;
    this.midvec = new Vec(Math.sin(midangle), Math.cos(midangle));
  }

  /**
   * Imperfeito como o original: pode dizer "sim" sem interseção real (círculo sobre o centro da
   * parede, cantos do setor), mas "não" é sempre correto.
   */
  intersectsCirc(rc: Vec, rr: number): boolean {
    const d = rc.sub(this.center);
    const dcr = d.mag();
    if (dcr - rr > this.ro) return false; // fora do círculo externo
    if (dcr + rr < this.ri) return false; // dentro do círculo interno
    if (this.angles[0] === this.angles[1]) return true; // círculo completo
    if (dcr - rr <= 0) return true; // cobre o centro: aposta segura
    // Faixa de ângulos que o círculo projeta a partir do centro da parede, nas coordenadas do mapa.
    let centerAngle = (Math.asin(-d.y / dcr) * 180) / N_PI;
    if (d.x < 0) centerAngle = 180 - centerAngle;
    centerAngle = 90 - centerAngle;
    if (centerAngle < 0) centerAngle += 360;
    const width = (Math.asin(rr / dcr) * 180) / N_PI;
    let a0 = this.angles[0];
    let a1 = this.angles[1];
    if (a1 < a0) a1 += 360;
    let ca0 = centerAngle - width;
    let ca1 = centerAngle + width;
    if (ca0 < 0) ca0 += 360;
    while (ca1 < ca0) ca1 += 360;
    if (ca0 <= a1 && ca1 >= a0) return true;
    // Desloca 360° numa das faixas para comparar.
    if (ca0 < a0) {
      ca0 += 360;
      ca1 += 360;
    } else {
      a0 += 360;
      a1 += 360;
    }
    return ca0 <= a1 && ca1 >= a0;
  }

  /** Imperfeito: testa contra o círculo que circunscreve o retângulo. */
  intersectsRect(x1: number, y1: number, x2: number, y2: number): boolean {
    const halfDiagonal = new Vec((x2 - x1) / 2, (y2 - y1) / 2);
    return this.intersectsCirc(new Vec(x1, y1).add(halfDiagonal), halfDiagonal.mag());
  }

  tryBounce(best: BounceData, st: Vec, m: Vec, plyRadius: number): BounceData {
    const { center: c, ro, ri, va1, va2 } = this;
    const d = c.sub(st);
    best = earlier(best, bounceFromArc(d, m, this.midvec, this.anglecos, ro, plyRadius, true)); // por fora
    if (ri > plyRadius) best = earlier(best, bounceFromArc(d, m, this.midvec, this.anglecos, ri, plyRadius, false)); // por dentro
    if (this.angles[0] === this.angles[1]) return best; // sem setor
    // Lados e cantos do setor; va1/va2 têm y invertido (coordenadas de mapa).
    for (const va of [va1, va2]) {
      const p1 = new Vec(c.x + ro * va.x - st.x, c.y - ro * va.y - st.y);
      const p2 = new Vec(c.x + ri * va.x - st.x, c.y - ri * va.y - st.y);
      best = earlier(best, bounceFromLine(p1, p2, m, plyRadius));
      best = earlier(best, bounceFromPoint(p1, m, plyRadius));
      best = earlier(best, bounceFromPoint(p2, m, plyRadius));
    }
    return best;
  }
}
