// SPDX-License-Identifier: GPL-2.0-or-later
// Aleatoriedade da simulação. A sim nunca usa Math.random: recebe um Rng. Para testes de paridade
// usa-se GlibcRand, que reproduz bit a bit o rand() da glibc usado pelo servidor original.

/** `RAND_MAX` da glibc. */
export const RAND_MAX = 2147483647;

/** Fonte de números aleatórios com a interface do `rand()` do C: inteiros em [0, RAND_MAX]. */
export interface Rng {
  rand(): number;
}

const DEGREE = 31; // TYPE_3: grau 31, separação 3
const SEPARATION = 3;

/**
 * `srand`/`rand` da glibc (gerador aditivo TYPE_3, glibc/stdlib/random_r.c). Validado contra o
 * build original (glibc 2.24) por `src/__fixtures__/glibc-rand.json`.
 */
export class GlibcRand implements Rng {
  private readonly state = new Int32Array(DEGREE);
  private front = SEPARATION;
  private rear = 0;

  /** Sem semente, a glibc se comporta como `srand(1)`. */
  constructor(seed = 1) {
    this.srand(seed);
  }

  srand(seed: number): void {
    // `seed` é unsigned int; zero vira 1. O estado inicial é calculado em int32 (`int32_t word`).
    let word = (seed >>> 0 === 0 ? 1 : seed >>> 0) | 0;
    this.state[0] = word;
    for (let i = 1; i < DEGREE; i++) {
      // state[i] = (16807 * state[i - 1]) % 2147483647, sem estourar 31 bits (Schrage).
      const hi = Math.trunc(word / 127773);
      const lo = word % 127773;
      word = 16807 * lo - 2836 * hi;
      if (word < 0) word += 2147483647;
      this.state[i] = word;
    }
    this.front = SEPARATION;
    this.rear = 0;
    for (let i = 0; i < DEGREE * 10; i++) this.rand();
  }

  rand(): number {
    const val = ((this.state[this.front] as number) + (this.state[this.rear] as number)) >>> 0;
    this.state[this.front] = val | 0;
    if (++this.front >= DEGREE) {
      this.front = 0;
      ++this.rear;
    } else if (++this.rear >= DEGREE) {
      this.rear = 0;
    }
    return val >>> 1; // descarta o bit menos aleatório
  }
}

/**
 * `std::random_shuffle(first, last)` da libstdc++ (GCC 6, bits/stl_algo.h:4439), que usa
 * `rand() % (i + 1)`. Embaralha no lugar e devolve o próprio array.
 */
export function randomShuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = 1; i < items.length; i++) {
    const j = rng.rand() % (i + 1);
    if (i !== j) {
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
  }
  return items;
}
