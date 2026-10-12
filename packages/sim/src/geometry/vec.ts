// SPDX-License-Identifier: GPL-2.0-or-later
// Vetor 2D com as mesmas operações do `struct Vec` original (src/utility.h:315-340). Imutável.

export class Vec {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}

  add(o: Vec): Vec {
    return new Vec(this.x + o.x, this.y + o.y);
  }

  sub(o: Vec): Vec {
    return new Vec(this.x - o.x, this.y - o.y);
  }

  mul(factor: number): Vec {
    return new Vec(this.x * factor, this.y * factor);
  }

  /** Como no original, dividir é multiplicar pelo inverso (`*this *= 1. / div`). */
  div(divisor: number): Vec {
    return this.mul(1 / divisor);
  }

  mag(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  mag2(): number {
    return this.x * this.x + this.y * this.y;
  }

  equals(o: Vec): boolean {
    return this.x === o.x && this.y === o.y;
  }
}

export function dot(a: Vec, b: Vec): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Vec, b: Vec): number {
  return a.x * b.y - a.y * b.x;
}
