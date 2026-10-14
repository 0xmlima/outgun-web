// SPDX-License-Identifier: GPL-2.0-or-later
// Gerador de mapas aleatórios (`MapGenerator`, src/mapgen.cpp, e `ServerWorld::generate_map`,
// src/world.cpp). Gera um labirinto de salas com simetria, escolhe as bases e as áreas de respawn e
// escreve o mapa no formato de arquivo do jogo, com um bloco de paredes de `mapgen/`. Spec:
// plan/specs/mapgen.md.
import type { Rng } from '@outgun/sim';

const enum Dir {
  Up = 0,
  Down = 1,
  Left = 2,
  Right = 3,
}

export type Symmetry = 'asymmetric' | 'rotational' | 'horizontal' | 'vertical';
const SYMMETRY_BY_INDEX: Symmetry[] = ['asymmetric', 'rotational', 'horizontal', 'vertical'];

class SimpleRoom {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
  visited = false;
  checkedThrough = false;
  teamFlag = false;
  greenFlag = false;
  /** −1 sem respawn, 0 vermelho, 1 azul, 2 os dois. */
  respawn = -1;

  constructor(walls: boolean) {
    this.top = this.bottom = this.left = this.right = walls;
  }

  addRespawn(team: number): void {
    if (this.respawn === -1) this.respawn = team;
    else if (this.respawn === 1 - team) this.respawn = 2;
  }

  clone(): SimpleRoom {
    return Object.assign(new SimpleRoom(false), this);
  }
}

interface DistRoom {
  x: number;
  y: number;
  /** −1 = inválida. */
  dist: number;
}

/** Bloco de paredes de `mapgen/` (nome do arquivo e conteúdo). */
export interface MapgenBlock {
  name: string;
  text: string;
}

/** O bloco embutido, usado quando `mapgen/` está vazio. */
const DEFAULT_BLOCK =
  ':room\nW 0 0 5 1\nW 16 0 11 1\nW 0 1 1 4\nW 16 1 15 4\nW 0 12 5 11\nW 16 12 11 11\nW 0 11 1 8\nW 16 11 15 8\n' +
  ':top\nW 5 0 11 1\n' +
  ':bottom\nW 5 12 11 11\n' +
  ':left\nW 0 4 1 8\n' +
  ':right\nW 16 4 15 8\n';

/** `rand() % 1000 < 1000 * p` com `p` em `float`, como no original. */
function chance(rng: Rng, p: number): boolean {
  return rng.rand() % 1000 < Math.fround(1000 * Math.fround(p));
}

export class MapGenerator {
  private room: SimpleRoom[][] = [];
  symmetry: Symmetry = 'rotational';
  private overEdge = false;
  private flags = 0;

  constructor(private readonly rng: Rng) {}

  get width(): number {
    return this.room.length;
  }

  get height(): number {
    return this.room[0]!.length;
  }

  private at(x: number, y: number): SimpleRoom {
    return this.room[x]![y]!;
  }

  /** Gera o mapa; devolve a distância (em salas) entre as bases (`MapGenerator::generate`). */
  generate(w: number, h: number, allowOverEdge = false, respawnArea = false, repetitiveRespawn = 0, greenFlagIn = false, createAsymmetric = false): number {
    const rng = this.rng;
    let greenFlag = greenFlagIn;
    this.overEdge = allowOverEdge;
    this.room = Array.from({ length: w }, () => Array.from({ length: h }, () => new SimpleRoom(true)));

    // sem bandeira verde se ela não pode ficar simétrica
    if (greenFlag && !createAsymmetric && w % 2 === 0 && h % 2 === 0) greenFlag = false;

    if (createAsymmetric) this.symmetry = 'asymmetric';
    else if (greenFlag) {
      if (w % 2 === 0) this.symmetry = 'vertical';
      else if (h % 2 === 0) this.symmetry = 'horizontal';
      // mapas com rotação só têm a sala do centro para a verde, o que pode ser chato
      else if (rng.rand() % 5 === 0) this.symmetry = 'rotational';
      else this.symmetry = rng.rand() % 2 ? 'horizontal' : 'vertical';
    } else if (rng.rand() % 4) this.symmetry = 'rotational';
    else {
      do this.symmetry = SYMMETRY_BY_INDEX[(rng.rand() % 3) + 1]!;
      while ((this.symmetry === 'vertical' && h === 1 && w > 1) || (this.symmetry === 'horizontal' && w === 1 && h > 1));
    }

    // inicializadores separados por vírgula: x antes de y
    let rx = rng.rand() % this.width;
    let ry = rng.rand() % this.height;
    this.at(rx, ry).visited = true;
    const visited = { rooms: 1 };
    const W = this.width;
    const H = this.height;
    while (visited.rooms < W * H) {
      const current = this.at(rx, ry);
      if (
        ((!this.overEdge && ry === 0) || this.at(rx, (ry + H - 1) % H).visited) &&
        ((!this.overEdge && ry === H - 1) || this.at(rx, (ry + 1) % H).visited) &&
        ((!this.overEdge && rx === 0) || this.at((rx + W - 1) % W, ry).visited) &&
        ((!this.overEdge && rx === W - 1) || this.at((rx + 1) % W, ry).visited)
      ) {
        current.checkedThrough = true;
        for (;;) {
          rx = rng.rand() % W;
          ry = rng.rand() % H;
          if (this.at(rx, ry).visited && !this.at(rx, ry).checkedThrough) break;
        }
        continue;
      }
      for (;;) {
        const dir = rng.rand() % 4;
        const dx = dir === Dir.Left ? -1 : dir === Dir.Right ? 1 : 0;
        const dy = dir === Dir.Up ? -1 : dir === Dir.Down ? 1 : 0;
        if (this.removeWall(rx, ry, dx, dy, visited)) break;
      }
    }

    this.shiftRoomsIfNeeded();

    // bandeiras
    let x1: number;
    let y1: number;
    let x2: number;
    let y2: number;
    let dist: number;
    if (this.symmetry === 'asymmetric') {
      const [a, b] = this.selectAsymmetricBases();
      x1 = a.x;
      y1 = a.y;
      x2 = b.x;
      y2 = b.y;
      dist = a.dist;
    } else {
      const base = this.selectBase(true, 0, 0);
      x1 = base.x;
      y1 = base.y;
      x2 = this.symmetry === 'vertical' ? x1 : W - 1 - x1;
      y2 = this.symmetry === 'horizontal' ? y1 : H - 1 - y1;
      dist = base.dist;
    }
    this.at(x1, y1).teamFlag = true;
    this.at(x2, y2).teamFlag = true;
    this.flags = x1 === x2 && y1 === y2 ? 1 : 2;

    if (greenFlag && this.flags === 2) {
      const green = this.symmetry === 'asymmetric' ? this.selectAsymmetricGreenBase(x1, y1, x2, y2) : this.selectGreenFlagBase(x1, y1);
      if (green.dist >= 0) {
        this.at(green.x, green.y).greenFlag = true;
        this.flags++;
      }
    }

    // áreas de respawn; `RoomCoords(rand() % w, rand() % h)`: o GCC sorteia o y primeiro
    if (respawnArea) {
      do {
        const redY = rng.rand() % h;
        const redX = rng.rand() % w;
        let blueX: number;
        let blueY: number;
        if (this.symmetry === 'asymmetric') {
          blueY = rng.rand() % h;
          blueX = rng.rand() % w;
        } else {
          blueX = this.symmetry === 'vertical' ? redX : W - 1 - redX;
          blueY = this.symmetry === 'horizontal' ? redY : H - 1 - redY;
        }
        this.at(redX, redY).addRespawn(0);
        this.at(blueX, blueY).addRespawn(1);
      } while (rng.rand() % 1000 < Math.fround(1000 * Math.fround(repetitiveRespawn)));
    }
    return dist;
  }

  private removeWall(rx: number, ry: number, dx: number, dy: number, visited: { rooms: number }, mirror = false): boolean {
    if (dx === dy) return false;
    const W = this.width;
    const H = this.height;
    const nx = rx + dx;
    const ny = ry + dy;
    if (!this.overEdge && (nx < 0 || nx >= W || ny < 0 || ny >= H)) return false;
    const next = this.at((nx + W) % W, (ny + H) % H);
    const current = this.at(rx, ry);
    if (!mirror && next.visited && this.symmetry !== 'asymmetric') return false;
    if (!mirror && !next.visited) {
      visited.rooms++;
      next.visited = true;
    }
    if (dy < 0) current.top = next.bottom = false;
    else if (dy > 0) current.bottom = next.top = false;
    else if (dx < 0) current.left = next.right = false;
    else if (dx > 0) current.right = next.left = false;
    if (this.symmetry !== 'asymmetric' && !mirror) {
      const mx1 = this.symmetry === 'vertical' ? rx : W - 1 - rx;
      const my1 = this.symmetry === 'horizontal' ? ry : H - 1 - ry;
      const mx2 = mx1 + (this.symmetry === 'vertical' ? dx : -dx);
      const my2 = my1 + (this.symmetry === 'horizontal' ? dy : -dy);
      this.removeWall(mx1, my1, mx2 - mx1, my2 - my1, visited, true);
    }
    return true;
  }

  /** Gira o mapa para começar numa linha/coluna com parede inteira, se houver. */
  private shiftRoomsIfNeeded(): void {
    const W = this.width;
    const H = this.height;
    const solidTop = this.room.every((col) => col[0]!.top);
    const solidLeft = this.room[0]!.every((r) => r.left);
    let xShift = 0;
    let yShift = 0;
    if (!solidTop) {
      for (let y = 0; y < H; y++) {
        if (this.room.every((col) => col[y]!.top)) {
          yShift = y;
          break;
        }
      }
    }
    if (!solidLeft) {
      for (let x = 0; x < W; x++) {
        if (this.room[x]!.every((r) => r.left)) {
          xShift = x;
          break;
        }
      }
    }
    if (xShift === 0 && yShift === 0) return;
    this.room = Array.from({ length: W }, (_, x) => Array.from({ length: H }, (_, y) => this.at((x + xShift) % W, (y + yShift) % H).clone()));
  }

  private selectGreenFlagBase(teamFlagX: number, teamFlagY: number): DistRoom {
    // a verde fica à mesma distância das duas bases: na linha do centro, salvo mapa assimétrico
    const s = this.symmetry;
    if (((s === 'horizontal' || s === 'rotational') && this.width % 2 === 0) || ((s === 'vertical' || s === 'rotational') && this.height % 2 === 0)) {
      return { x: 0, y: 0, dist: -1 };
    }
    return this.selectBase(false, teamFlagX, teamFlagY);
  }

  private selectBase(teamBase: boolean, teamFlagXIn: number, teamFlagYIn: number): DistRoom {
    const s = this.symmetry;
    const W = this.width;
    const H = this.height;
    const candidates: DistRoom[] = [];
    let maxDist = 0;
    let teamFlagX = teamFlagXIn;
    let teamFlagY = teamFlagYIn;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (teamBase) {
          teamFlagX = s === 'vertical' ? x : W - 1 - x;
          teamFlagY = s === 'horizontal' ? y : H - 1 - y;
        } else if (
          this.at(x, y).teamFlag ||
          ((s === 'horizontal' || s === 'rotational') && x !== Math.trunc(W / 2)) ||
          ((s === 'vertical' || s === 'rotational') && y !== Math.trunc(H / 2))
        ) {
          continue;
        }
        const dist = this.distance(x, y, teamFlagX, teamFlagY);
        candidates.push({ x, y, dist });
        if (dist > maxDist) maxDist = dist;
      }
    }
    const minDist = teamBase ? Math.min(maxDist, Math.max(Math.trunc((8 * maxDist) / 10), 3)) : maxDist;
    const kept = candidates.filter((c) => c.dist >= minDist);
    if (kept.length === 0) throw new Error('mapgen: nenhuma base candidata');
    return kept[this.rng.rand() % kept.length]!;
  }

  /** As salas mais distantes entre si. */
  private selectAsymmetricBases(): [DistRoom, DistRoom] {
    const W = this.width;
    const H = this.height;
    let candidates: [DistRoom, DistRoom][] = [];
    let maxDist = 0;
    for (let sy = 0; sy < H; sy++) {
      for (let sx = 0; sx < W; sx++) {
        for (let ey = sy; ey < H; ey++) {
          for (let ex = sx; ex < W; ex++) {
            const dist = this.distance(sx, sy, ex, ey);
            if (dist >= maxDist) {
              if (dist > maxDist) {
                candidates = [];
                maxDist = dist;
              }
              candidates.push([
                { x: sx, y: sy, dist },
                { x: ex, y: ey, dist },
              ]);
            }
          }
        }
      }
    }
    return candidates[this.rng.rand() % candidates.length]!;
  }

  /** Sala o mais longe possível e à mesma distância das duas bases; nem sempre existe. */
  private selectAsymmetricGreenBase(redX: number, redY: number, blueX: number, blueY: number): DistRoom {
    let candidates: DistRoom[] = [];
    let maxDist = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.at(x, y).teamFlag) continue;
        const redDist = this.distance(x, y, redX, redY);
        if (redDist < maxDist) continue;
        const blueDist = this.distance(x, y, blueX, blueY);
        if (blueDist < maxDist || blueDist !== redDist) continue;
        if (redDist > maxDist) {
          candidates = [];
          maxDist = redDist;
        }
        candidates.push({ x, y, dist: redDist });
      }
    }
    if (candidates.length === 0) return { x: 0, y: 0, dist: -1 };
    return candidates[this.rng.rand() % candidates.length]!;
  }

  /** Caminho mais curto em salas (A*, `MapGenerator::distance`). */
  private distance(sx: number, sy: number, gx: number, gy: number): number {
    if (gx === sx && gy === sy) return 0;
    const W = this.width;
    const H = this.height;
    const INT_MAX = 2147483647;
    const cost = Array.from({ length: W }, () => new Array<number>(H).fill(INT_MAX));
    const score = Array.from({ length: W }, () => new Array<number>(H).fill(INT_MAX));
    cost[sx]![sy] = 0;
    score[sx]![sy] = Math.abs(gx - sx) + Math.abs(gy - sy);
    const open: [number, number][] = [[sx, sy]];
    while (open.length > 0) {
      // o primeiro de menor nota
      let best = 0;
      let bestScore = INT_MAX;
      open.forEach(([x, y], i) => {
        if (score[x]![y]! < bestScore) {
          bestScore = score[x]![y]!;
          best = i;
        }
      });
      const [rx, ry] = open[best]!;
      open.splice(best, 1);
      if (rx === gx && ry === gy) return cost[rx]![ry]!;
      const c = cost[rx]![ry]! + 1;
      const r = this.at(rx, ry);
      for (let i = 0; i < 4; i++) {
        let dx = 0;
        let dy = 0;
        if (i === Dir.Up) {
          if (r.top) continue;
          dy = -1;
        } else if (i === Dir.Down) {
          if (r.bottom) continue;
          dy = 1;
        } else if (i === Dir.Left) {
          if (r.left) continue;
          dx = -1;
        } else {
          if (r.right) continue;
          dx = 1;
        }
        const nx = (rx + W + dx) % W;
        const ny = (ry + H + dy) % H;
        if (c >= cost[nx]![ny]!) continue; // caminho pior
        cost[nx]![ny] = c;
        let minDx = Math.abs(gx - nx);
        let minDy = Math.abs(gy - ny);
        if (this.overEdge) {
          if (minDx > Math.trunc(W / 2)) minDx = W - minDx;
          if (minDy > Math.trunc(H / 2)) minDy = H - minDy;
        }
        score[nx]![ny] = c + minDx + minDy;
        if (!open.some(([x, y]) => x === nx && y === ny)) open.push([nx, ny]);
      }
    }
    return 0;
  }

  /**
   * Texto do mapa (`save_map`). `blocks`: os arquivos de `mapgen/` na ordem em que são listados;
   * um é sorteado (amostragem de reservatório com um `rand()` por arquivo). `header`: linhas de
   * comentário do início (no original, versão e data).
   */
  saveMap(title: string, author: string, blocks: readonly MapgenBlock[], header: readonly string[] = []): string {
    const rng = this.rng;
    const W = this.width;
    const H = this.height;
    let out = header.map((l) => `; ${l}\n`).join('');
    out += `P width ${W}\nP height ${H}\nP title ${title}\nP author ${author}\nS 16 12\nX room 0 0 ${W - 1} ${H - 1}\n`;
    let flagTeam = rng.rand() % 2;
    // um piso só para as salas de respawn dos dois times: 1 e 2 pisos alternativos, 5 gelo, 6 areia, 7 lama
    let commonRespawnTexture = (rng.rand() % 5) + 1;
    if (commonRespawnTexture > 2) commonRespawnTexture += 2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const r = this.at(x, y);
        if (r.teamFlag) {
          out += `flag ${this.flags === 1 ? 2 : flagTeam} ${x} ${y} 8 6\n`;
          flagTeam = 1 - flagTeam;
        } else if (r.greenFlag) out += `flag 2 ${x} ${y} 8 6\n`;
        for (const [wall, name] of [
          [r.top, 'top'],
          [r.bottom, 'bottom'],
          [r.left, 'left'],
          [r.right, 'right'],
        ] as const) {
          if (wall) out += `X ${name} ${x} ${y}\n`;
        }
        if (r.respawn !== -1) {
          out += `V respawn ${r.respawn} ${x} ${y}\n`;
          const floor = r.respawn === 2 ? commonRespawnTexture : r.respawn + 3; // 3 piso vermelho, 4 azul
          out += `R ${x} ${y}\nG 0 0 16 12 ${floor}\n`;
        }
      }
    }
    let chosen: MapgenBlock | undefined;
    blocks.forEach((b, i) => {
      if (rng.rand() % (i + 1) === 0) chosen = b;
    });
    return out + (chosen ? chosen.text : DEFAULT_BLOCK);
  }

  /** Desenho em texto do labirinto (`draw`), para depuração. */
  draw(): string {
    let out = '';
    for (let y = 0; y < this.height; y++) {
      for (let i = 0; i < 3; i++) {
        if (i === 0 && y > 0) continue;
        for (let x = 0; x < this.width; x++) {
          const r = this.at(x, y);
          if (i === 1) {
            if (x === 0) out += r.left ? '|' : ' ';
            out += r.teamFlag ? ' P ' : r.greenFlag ? ' G ' : '   ';
            out += r.right ? '|' : ' ';
          } else {
            if (x === 0) out += '+';
            out += (i === 0 && r.top) || (i === 2 && r.bottom) ? '---+' : '   +';
          }
        }
        out += '\n';
      }
    }
    return out;
  }
}

/** Parâmetros de `random_map` (`MapInfo`). */
export interface RandomMapParams {
  width: number;
  height: number;
  overEdge: number;
  respawnArea: number;
  repetitiveRespawnArea: number;
  wildFlag: number;
  asymmetric: boolean;
}

/**
 * Um mapa aleatório como o servidor original gera para a rotação (`ServerWorld::generate_map`): até
 * 50 tentativas até as bases ficarem a mais de 1 sala (salvo mapas de até 2 salas de lado). Título
 * `<Random>`, autor `Outgun`.
 */
export function generateRandomMap(params: RandomMapParams, rng: Rng, blocks: readonly MapgenBlock[], header: readonly string[] = []): string {
  const generator = new MapGenerator(rng);
  for (let i = 0; i < 50; i++) {
    // argumentos avaliados da direita para a esquerda: verde, respawn e só então "pelas bordas"
    const wild = chance(rng, params.wildFlag);
    const respawn = chance(rng, params.respawnArea);
    const overEdge = chance(rng, params.overEdge);
    const baseDistance = generator.generate(params.width, params.height, overEdge, respawn, params.repetitiveRespawnArea, wild, params.asymmetric);
    if (baseDistance > 1 || params.width <= 2 || params.height <= 2) break;
  }
  return generator.saveMap('<Random>', 'Outgun', blocks, header);
}
