// SPDX-License-Identifier: GPL-2.0-or-later
// Tabelas de distância entre áreas (`Robot::BuildDistanceTable`, src/robot.cpp:996-1031). No original
// as distâncias moram dentro das Areas da cópia do AreaMap de cada bot; aqui ficam num vetor por
// tabela, indexado por `Area.index`, e o AreaMap é compartilhado sem cópia.
import type { Area, AreaMap } from './areamap.js';

/** Qual tabela (`DistanceTableId`, src/bot_support.h:31). */
export enum DistanceTableId {
  /** Sempre centrada no bot. */
  Main = 0,
  /** Usada para calcular a necessidade de defesa. */
  Def = 1,
  /** Sempre centrada no destino escolhido. */
  Destination = 2,
}

/** Distância entre salas vizinhas sem modificadores (`roomToRoomBaseDistance`, src/robot.h:61). */
export const ROOM_TO_ROOM_BASE_DISTANCE = 1000;

/**
 * Fila de prioridade com a mesma ordem de saída do `std::priority_queue` da libstdc++ (heap binário
 * de `push_heap`/`pop_heap`). A ordem entre empates muda as distâncias, porque cada área recebe a
 * distância quando entra na fila, não quando sai.
 */
class StdPriorityQueue<T> {
  private readonly c: T[] = [];

  /** `less(a, b)`: `a` sai depois de `b` (o comparador do C++). */
  constructor(private readonly less: (a: T, b: T) => boolean) {}

  get empty(): boolean {
    return this.c.length === 0;
  }

  push(value: T): void {
    this.c.push(value);
    this.pushHeap(this.c.length - 1, 0, value);
  }

  /** `top()` seguido de `pop()`. */
  pop(): T {
    const c = this.c;
     
    const top = c[0]!;
    const len = c.length - 1;
    if (len > 0) {
       
      const value = c[len]!;
      c[len] = top;
      this.adjustHeap(0, len, value);
    }
    c.pop();
    return top;
  }

  private pushHeap(hole: number, top: number, value: T): void {
    const c = this.c;
    let parent = Math.trunc((hole - 1) / 2);
    while (hole > top && this.less(c[parent] as T, value)) {
      c[hole] = c[parent] as T;
      hole = parent;
      parent = Math.trunc((hole - 1) / 2);
    }
    c[hole] = value;
  }

  private adjustHeap(hole: number, len: number, value: T): void {
    const c = this.c;
    const top = hole;
    let second = hole;
    while (second < Math.trunc((len - 1) / 2)) {
      second = 2 * (second + 1);
      if (this.less(c[second] as T, c[second - 1] as T)) second--;
      c[hole] = c[second] as T;
      hole = second;
    }
    if ((len & 1) === 0 && second === Math.trunc((len - 2) / 2)) {
      second = 2 * (second + 1);
      c[hole] = c[second - 1] as T;
      hole = second - 1;
    }
    this.pushHeap(hole, top, value);
  }
}

/**
 * Preenche `distance` (indexado por `Area.index`; -1 = inalcançável) a partir de `start`. Entrar numa
 * área custa 1000, menos metade do valor de respawn do próprio time e mais o do inimigo, ambos
 * multiplicados por `respawnWeight` (1 quando o bot leva a bandeira).
 */
export function buildDistanceTable(
  distance: Int32Array,
  start: Area,
  respawnWeight: number,
  team: 0 | 1,
): void {
  distance.fill(-1);
  const queue = new StdPriorityQueue<Area>((a, b) => distance[a.index]! > distance[b.index]!);
  distance[start.index] = 0;
  queue.push(start);
  while (!queue.empty) {
    const a = queue.pop();
    for (const n of a.neighbors) {
      if (distance[n.area.index] !== -1) continue;
      let dist = 1;
      dist -= n.area.respawnValue[team] * respawnWeight * 0.5;
      dist += n.area.respawnValue[team === 0 ? 1 : 0] * respawnWeight;
      distance[n.area.index] = distance[a.index]! + Math.trunc(dist * ROOM_TO_ROOM_BASE_DISTANCE);
      queue.push(n.area);
    }
  }
}

/**
 * Tabelas com peso de respawn 0 dependem só do mapa e do centro (o time não entra na conta): são
 * calculadas uma vez por área e compartilhadas por todos os bots do mapa. Só leitura.
 */
const zeroWeightTables = new WeakMap<AreaMap, Map<Area, Int32Array>>();

function zeroWeightTable(areaMap: AreaMap, start: Area): Int32Array {
  let byStart = zeroWeightTables.get(areaMap);
  if (!byStart) zeroWeightTables.set(areaMap, (byStart = new Map()));
  let table = byStart.get(start);
  if (!table) {
    table = new Int32Array(areaMap.areas.length);
    buildDistanceTable(table, start, 0, 0);
    byStart.set(start, table);
  }
  return table;
}

/** As três tabelas de um bot, recalculadas só quando o centro ou o peso mudam (`DistanceTableDescriptor`). */
export class DistanceTables {
  private readonly tables: Int32Array[];
  /** Tabela própria de cada id (as de peso 0 apontam para as compartilhadas). */
  private readonly own: Int32Array[];
  private readonly centers: (Area | null)[] = [null, null, null];
  private readonly weights: number[] = [0, 0, 0];

  constructor(readonly areaMap: AreaMap) {
    this.own = [0, 1, 2].map(() => new Int32Array(areaMap.areas.length).fill(-1));
    this.tables = [...this.own];
  }

  /** Distância de `area` ao centro da tabela; -1 se não alcança ou a tabela não foi construída. */
  distance(id: DistanceTableId, area: Area): number {
    return this.tables[id]![area.index]!;
  }

  build(id: DistanceTableId, start: Area, respawnWeight: number, team: 0 | 1): void {
    if (this.centers[id] === start && this.weights[id] === respawnWeight) return;
    this.centers[id] = start;
    this.weights[id] = respawnWeight;
    if (respawnWeight === 0) {
      this.tables[id] = zeroWeightTable(this.areaMap, start);
      return;
    }
    const own = this.own[id]!;
    this.tables[id] = own;
    buildDistanceTable(own, start, respawnWeight, team);
  }

  /** Centro e peso da última construção (o `DistanceTableDescriptor`); centro null = nunca construída. */
  descriptor(id: DistanceTableId): [Area | null, number] {
    return [this.centers[id] ?? null, this.weights[id] ?? 0];
  }

  /** Esquece os centros (`Robot::BuildMap` ao trocar de mapa zera os descritores). */
  reset(): void {
    this.centers.fill(null);
  }
}
