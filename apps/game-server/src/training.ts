// SPDX-License-Identifier: GPL-2.0-or-later
// Sala de treino (OG-490, D-86, RN-TRN-01): a mesma situação de jogo em tentativas curtas, em laço —
// posicionar todos, contagem com todos parados, jogar, resultado (sucesso/falha + motivo + tempo) e
// reinício. Sem placar de partida, tempo limite nem fim de partida. Cada modo (OG-493 a OG-496) só
// diz quem joga, onde cada um começa e quando a tentativa acaba.
import type { TrainingRole } from '@outgun/bots';
import { GlibcRand, PLAYER_RADIUS, Position, ROOM_HEIGHT, ROOM_WIDTH, type GameMap, type WorldCoords } from '@outgun/sim';

export type TrainingModeId = 'attack' | 'defense' | 'escape' | 'capture';
/** Papel fixo de um bot de treino (RN-TRN-03); o comportamento fica no `TrainingRobot` (OG-491). */
export type { TrainingRole };
export type TrainingReason = 'died' | 'defendersDown' | 'flagOut' | 'attackersDown' | 'captured' | 'delivered' | 'returned' | 'timeout';

/** Opções da sala de treino, escolhidas na criação (OG-492). */
export interface TrainingConfig {
  mode: TrainingModeId;
  /** Bots do outro lado: defensores (Ataque), atacantes (Defesa), perseguidores (Fuga) ou a escolta máxima (Captura). */
  bots: number;
  /** Bots aliados de quem treina (só na Defesa, 0 a 2). */
  allies: number;
  /** Nível dos bots, 1 a 5; 0 = progressivo (OG-499). */
  level: number;
  /** Power-ups (desligados por padrão, RN-TRN-06). */
  powerups: boolean;
  /** Mesmo início em todas as tentativas (OG-500); o padrão é variar. */
  sameStart: boolean;
}

/** Limites das opções por modo (RN-TRN-04). */
export const TRAINING_LIMITS: Record<TrainingModeId, { bots: [number, number]; allies: [number, number] }> = {
  attack: { bots: [1, 4], allies: [0, 0] },
  defense: { bots: [1, 5], allies: [0, 2] },
  escape: { bots: [1, 4], allies: [0, 0] },
  capture: { bots: [0, 3], allies: [0, 0] },
};

/** Opções dentro dos limites do modo. */
export function clampTraining(c: TrainingConfig): TrainingConfig {
  const l = TRAINING_LIMITS[c.mode];
  const clamp = (v: number, [lo, hi]: [number, number]) => Math.max(lo, Math.min(hi, Math.trunc(v)));
  return { ...c, bots: clamp(c.bots, l.bots), allies: clamp(c.allies, l.allies), level: clamp(c.level, [0, 5]) };
}

/** Time de quem treina (humanos do lado de treino); os bots do outro lado ficam no outro time. */
export const TRAINEE_TEAM = 0;
export const OPPONENT_TEAM = 1;

/** Contagem antes de soltar todos (3-2-1) e o resultado na tela antes do reinício (~2 s), em frames. */
export const COUNTDOWN_FRAMES = 30;
export const RESULT_FRAMES = 20;
/** Tentativa que não termina (bots presos, ninguém agindo) falha depois disto. */
export const ATTEMPT_LIMIT_FRAMES = 1200;

/** Um bot que a tentativa precisa: time e papel. */
export interface BotSlot {
  team: 0 | 1;
  role: TrainingRole;
}

/** O que o juiz sabe do mundo e do mapa (a sala implementa). */
export interface TrainingWorld {
  readonly map: GameMap;
  readonly frame: number;
  /** Jogadores presentes e vivos ou não: pid, time, se é bot, papel (bots), posição e se carrega bandeira (time dela). */
  players(): TrainingPlayer[];
  /** Posição atual da bandeira do time (a primeira) e se está no ponto. */
  flag(team: 0 | 1): { pos: Position; atBase: boolean; carrier: number } | null;
}

export interface TrainingPlayer {
  pid: number;
  team: 0 | 1;
  bot: boolean;
  role: TrainingRole | null;
  dead: boolean;
  /** Já carregou o mapa (humano) e pode ser posicionado. */
  ready: boolean;
  pos: Position;
  /** Time da bandeira que carrega, ou null. */
  carrying: 0 | 1 | null;
}

/** Contexto que o modo recebe para posicionar: mapa, sorteio, salas das bases e utilitários. */
export interface PlacementContext {
  readonly map: GameMap;
  readonly rng: GlibcRand;
  readonly config: TrainingConfig;
  /** Sala da bandeira do time ("quadrado da base", RN-TRN-02). */
  baseRoom(team: 0 | 1): { x: number; y: number };
  /** Sala a `steps` salas da base de `from`, no caminho até a base de `toward` (ou a mais longe possível). */
  roomOnPath(from: 0 | 1, toward: 0 | 1, steps: number): { x: number; y: number };
  /** Sala sorteada a exatamente `steps` salas da base do time, em qualquer direção (ou a mais longe possível). */
  roomAround(team: 0 | 1, steps: number): { x: number; y: number };
  /** Ponto livre (sem parede) na sala, longe dos já escolhidos; `near` puxa para perto de um ponto. */
  spot(room: { x: number; y: number }, near?: WorldCoords): Position;
  /** Ponto da bandeira do time. */
  flagSpot(team: 0 | 1): Position;
}

/** Evento do jogo que pode encerrar a tentativa. */
export type TrainingEvent = { kind: 'death'; pid: number } | { kind: 'capture'; pid: number; flagTeam: number } | { kind: 'return'; pid: number } | { kind: 'frame' };

export interface TrainingOutcome {
  success: boolean;
  reason: TrainingReason;
}

/** Um modo de treino: os bots, o posicionamento e as condições de fim. */
export interface TrainingModeDef {
  /** Bots da tentativa (pode variar a cada tentativa, ex. a escolta da Captura). */
  roster(ctx: PlacementContext): BotSlot[];
  /** Onde cada jogador começa; quem não estiver no mapa fica onde está. */
  place(ctx: PlacementContext, players: TrainingPlayer[]): Map<number, Position>;
  /** Fim da tentativa, ou null para seguir. */
  judge(world: TrainingWorld, ev: TrainingEvent, ctx: PlacementContext): TrainingOutcome | null;
}

/** Sai do quadrado da base (RN-TRN-02): está fora da sala da bandeira do time. */
export function outOfBaseRoom(map: GameMap, team: 0 | 1, pos: Position): boolean {
  const base = map.teams[team].flags[0];
  return !!base && (pos.roomX !== base.room.x || pos.roomY !== base.room.y);
}

/** Humanos do lado de treino. */
export function trainees(world: TrainingWorld): TrainingPlayer[] {
  return world.players().filter((p) => !p.bot && p.team === TRAINEE_TEAM);
}

/** Do outro lado: bots dos papéis e humanos que assumiram a vaga de um bot (OG-497). */
export function opponents(world: TrainingWorld): TrainingPlayer[] {
  return world.players().filter((p) => p.team !== TRAINEE_TEAM);
}

/** Morte de quem treina: falha quando todos os humanos do lado de treino caíram. */
export function traineeDeath(world: TrainingWorld, ev: TrainingEvent): TrainingOutcome | null {
  if (ev.kind !== 'death') return null;
  const dead = world.players().find((p) => p.pid === ev.pid);
  return dead && !dead.bot && dead.team === TRAINEE_TEAM && allTraineesDead(world) ? { success: false, reason: 'died' } : null;
}

/** Todos os humanos do lado de treino morreram (com convidados, a falha é só quando caem todos; RN-TRN-05). */
export function allTraineesDead(world: TrainingWorld): boolean {
  const t = trainees(world);
  return t.length > 0 && t.every((p) => p.dead);
}

/** Salas ligadas por uma passagem sem parede na divisa (amostrada ao longo da borda). */
function passable(map: GameMap, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const r = PLAYER_RADIUS;
  const along = dx !== 0 ? ROOM_HEIGHT : ROOM_WIDTH;
  for (let t = r; t <= along - r; t += 4) {
    const here: WorldCoords = dx !== 0 ? { room: a, x: dx > 0 ? ROOM_WIDTH - r : r, y: t } : { room: a, x: t, y: dy > 0 ? ROOM_HEIGHT - r : r };
    const there: WorldCoords = dx !== 0 ? { room: b, x: dx > 0 ? r : ROOM_WIDTH - r, y: t } : { room: b, x: t, y: dy > 0 ? r : ROOM_HEIGHT - r };
    if (!map.fallOnWallCirc(here, r) && !map.fallOnWallCirc(there, r)) return true;
  }
  return false;
}

/** Distância em salas a partir de uma sala (BFS pelas passagens); −1 = inalcançável. */
export function roomDistances(map: GameMap, from: { x: number; y: number }): number[] {
  const dist = new Array<number>(map.width * map.height).fill(-1);
  dist[from.y * map.width + from.x] = 0;
  const queue = [from];
  while (queue.length) {
    const a = queue.shift()!;
    const d = dist[a.y * map.width + a.x]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const b = { x: a.x + dx, y: a.y + dy };
      if (b.x < 0 || b.y < 0 || b.x >= map.width || b.y >= map.height || dist[b.y * map.width + b.x] !== -1) continue;
      if (!passable(map, a, b)) continue;
      dist[b.y * map.width + b.x] = d + 1;
      queue.push(b);
    }
  }
  return dist;
}

/** Posicionamento sobre um mapa, com o sorteio da tentativa. */
export class Placement implements PlacementContext {
  private readonly taken: Position[] = [];
  private readonly distCache = new Map<number, number[]>();

  constructor(
    readonly map: GameMap,
    readonly rng: GlibcRand,
    readonly config: TrainingConfig,
  ) {}

  baseRoom(team: 0 | 1): { x: number; y: number } {
    const f = this.map.teams[team].flags[0];
    if (!f) throw new Error(`mapa sem bandeira do time ${team}`);
    return { x: f.room.x, y: f.room.y };
  }

  private distancesFromBase(team: 0 | 1): number[] {
    let d = this.distCache.get(team);
    if (!d) {
      d = roomDistances(this.map, this.baseRoom(team));
      this.distCache.set(team, d);
    }
    return d;
  }

  roomOnPath(from: 0 | 1, toward: 0 | 1, steps: number): { x: number; y: number } {
    const fromD = this.distancesFromBase(from);
    const towardD = this.distancesFromBase(toward);
    const w = this.map.width;
    const total = towardD[this.baseRoom(from).y * w + this.baseRoom(from).x] ?? -1;
    // salas no caminho mais curto entre as bases, a `steps` da base de partida (sem passar da outra)
    const want = total > 0 ? Math.min(steps, total) : steps;
    let candidates: number[] = [];
    for (let i = 0; i < fromD.length; i++) {
      if (fromD[i] !== want) continue;
      if (total > 0 && fromD[i]! + towardD[i]! !== total) continue;
      candidates.push(i);
    }
    // mapa sem caminho entre as bases (ou passo além dele): qualquer sala àquela distância, ou a mais longe
    if (candidates.length === 0) {
      const reach = fromD.filter((d) => d >= 0);
      const best = Math.min(want, Math.max(...reach));
      candidates = fromD.flatMap((d, i) => (d === best ? [i] : []));
    }
    const i = candidates[this.rng.rand() % candidates.length]!;
    return { x: i % w, y: Math.trunc(i / w) };
  }

  roomAround(team: 0 | 1, steps: number): { x: number; y: number } {
    const d = this.distancesFromBase(team);
    const best = Math.min(steps, Math.max(...d));
    const candidates = d.flatMap((v, i) => (v === best ? [i] : []));
    const i = candidates[this.rng.rand() % candidates.length]!;
    return { x: i % this.map.width, y: Math.trunc(i / this.map.width) };
  }

  spot(room: { x: number; y: number }, near?: WorldCoords): Position {
    const r = PLAYER_RADIUS;
    let best: Position | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 60; i++) {
      const x = 2 * r + (this.rng.rand() % (ROOM_WIDTH - 4 * r));
      const y = 2 * r + (this.rng.rand() % (ROOM_HEIGHT - 4 * r));
      if (this.map.fallOnWallCirc({ room, x, y }, r + 2)) continue;
      // longe dos outros já escolhidos; perto de `near` quando pedido
      let minGap = Infinity;
      for (const p of this.taken) if (p.roomX === room.x && p.roomY === room.y) minGap = Math.min(minGap, Math.hypot(p.x - x, p.y - y));
      const gap = Math.min(minGap, 6 * r);
      const pull = near ? -Math.hypot(near.x - x, near.y - y) / 4 : 0;
      const score = gap + pull;
      if (score > bestScore) {
        bestScore = score;
        best = new Position(room.x, room.y, x, y);
      }
    }
    const pos = best ?? this.fallback(room);
    this.taken.push(pos);
    return pos;
  }

  /** Sala toda parede nas amostras: o ponto de spawn mais próximo, ou o centro. */
  private fallback(room: { x: number; y: number }): Position {
    for (const t of this.map.teams) for (const s of t.spawn) if (s.room.x === room.x && s.room.y === room.y) return new Position(room.x, room.y, s.x, s.y);
    return new Position(room.x, room.y, ROOM_WIDTH / 2, ROOM_HEIGHT / 2);
  }

  flagSpot(team: 0 | 1): Position {
    const f = this.map.teams[team].flags[0]!;
    const pos = new Position(f.room.x, f.room.y, f.x, f.y);
    this.taken.push(pos);
    return pos;
  }
}

/** `idle`: esperando o primeiro humano carregar o mapa. */
export type TrainingPhase = 'idle' | 'countdown' | 'playing' | 'result';

/** O que a sala faz pelo juiz. */
export interface TrainingRoomOps {
  /** Garante os bots da tentativa (entra/sai bot, troca papel); devolve quando a lista estiver pronta. */
  setBots(slots: BotSlot[]): void;
  /**
   * Põe o jogador vivo no ponto, parado, sem tiro nem dano até `safeUntil` (frame). `fresh`: começo da
   * tentativa (renasce com vida, arma e sem bandeira); senão só segura no lugar durante a contagem.
   */
  place(pid: number, pos: Position, safeUntil: number, fresh: boolean): void;
  /** Bandeiras de volta aos pontos. */
  resetFlags(): void;
  /** Avisa os clientes do estado (`trainingState`). */
  announce(state: TrainingAnnouncement): void;
  /** Jogador morto não renasce dentro da tentativa. */
  holdRespawn(pid: number): void;
}

export interface TrainingAnnouncement {
  phase: Exclude<TrainingPhase, 'idle'>;
  seconds: number;
  result: 'none' | 'success' | 'fail';
  reason: TrainingReason | 'none';
  tenths: number;
  successes: number;
  attempts: number;
  level: number;
  levelChange: 'none' | 'up' | 'down';
}

/** Juiz da tentativa: a máquina de fases da sala de treino. */
export class TrainingSession {
  phase: TrainingPhase = 'idle';
  /** Frame em que a fase atual acaba (contagem e resultado) ou em que o jogo começou. */
  private phaseUntil = 0;
  private startFrame = 0;
  private starts = new Map<number, Position>();
  private ctx: Placement | null = null;
  private last: TrainingOutcome | null = null;
  private lastTenths = 0;
  successes = 0;
  attempts = 0;
  private readonly rng: GlibcRand;
  private readonly seed: number;
  /** Nível em vigor dos bots (1 a 5); no progressivo, muda com os resultados (OG-499). */
  level: number;
  private levelChange: 'none' | 'up' | 'down' = 'none';

  constructor(
    readonly config: TrainingConfig,
    readonly mode: TrainingModeDef,
    private readonly world: TrainingWorld,
    private readonly ops: TrainingRoomOps,
    seed: number,
  ) {
    this.seed = seed;
    this.rng = new GlibcRand(seed);
    this.level = config.level === 0 ? 3 : config.level;
  }

  /** Começa a primeira tentativa (ou a próxima, depois do resultado). */
  begin(): void {
    // "mesmo início": o sorteio recomeça igual a cada tentativa (OG-500)
    const rng = this.config.sameStart ? new GlibcRand(this.seed) : this.rng;
    const ctx = new Placement(this.world.map, rng, this.config);
    this.ctx = ctx;
    this.ops.setBots(this.mode.roster(ctx));
    this.starts = this.mode.place(ctx, this.world.players().filter((p) => p.ready));
    this.phase = 'countdown';
    this.phaseUntil = this.world.frame + COUNTDOWN_FRAMES;
    for (const [pid, pos] of this.starts) this.ops.place(pid, pos, this.phaseUntil, true);
    this.ops.resetFlags();
    this.announce();
  }

  /** Todos no ponto de partida, parados e sem tiro até o fim da contagem. */
  private hold(): void {
    for (const [pid, pos] of this.starts) this.ops.place(pid, pos, this.phaseUntil, false);
  }

  /** Um frame da sala, depois da simulação. */
  tick(): void {
    const frame = this.world.frame;
    if (this.phase === 'idle') {
      if (trainees(this.world).some((p) => p.ready)) this.begin();
      return;
    }
    if (this.phase === 'countdown') {
      if (frame >= this.phaseUntil) {
        this.phase = 'playing';
        this.startFrame = frame;
        this.announce();
        return;
      }
      this.hold();
      const before = Math.ceil((this.phaseUntil - frame) / 10);
      const after = Math.ceil((this.phaseUntil - frame - 1) / 10);
      if (after !== before && after > 0) this.announce(after);
      return;
    }
    if (this.phase === 'result') {
      if (frame >= this.phaseUntil) this.begin();
      return;
    }
    if (frame - this.startFrame >= ATTEMPT_LIMIT_FRAMES) return this.finish({ success: false, reason: 'timeout' });
    this.event({ kind: 'frame' });
  }

  /** Evento do jogo (morte, captura, devolução) durante a tentativa. */
  event(ev: TrainingEvent): void {
    if (this.phase !== 'playing' || !this.ctx) {
      if (ev.kind === 'death') this.ops.holdRespawn(ev.pid);
      return;
    }
    if (ev.kind === 'death') this.ops.holdRespawn(ev.pid);
    const outcome = this.mode.judge(this.world, ev, this.ctx);
    if (outcome) this.finish(outcome);
  }

  private finish(outcome: TrainingOutcome): void {
    this.attempts++;
    if (outcome.success) this.successes++;
    this.last = outcome;
    this.lastTenths = this.world.frame - this.startFrame;
    this.levelChange = 'none';
    this.phase = 'result';
    this.phaseUntil = this.world.frame + RESULT_FRAMES;
    this.announce();
  }

  private announce(seconds?: number): void {
    if (this.phase === 'idle') return;
    const counting = this.phase === 'countdown';
    const showResult = this.phase === 'result' && this.last;
    this.ops.announce({
      phase: this.phase,
      seconds: counting ? (seconds ?? Math.ceil((this.phaseUntil - this.world.frame) / 10)) : 0,
      result: showResult ? (this.last!.success ? 'success' : 'fail') : 'none',
      reason: showResult ? this.last!.reason : 'none',
      tenths: showResult ? this.lastTenths : 0,
      successes: this.successes,
      attempts: this.attempts,
      level: this.level,
      levelChange: this.phase === 'result' ? this.levelChange : 'none',
    });
  }

  /** Estado atual para quem entra no meio. */
  snapshot(): TrainingAnnouncement | null {
    if (this.phase === 'idle') return null;
    const showResult = this.phase === 'result' && this.last;
    return {
      phase: this.phase,
      seconds: this.phase === 'countdown' ? Math.max(1, Math.ceil((this.phaseUntil - this.world.frame) / 10)) : 0,
      result: showResult ? (this.last!.success ? 'success' : 'fail') : 'none',
      reason: showResult ? this.last!.reason : 'none',
      tenths: showResult ? this.lastTenths : 0,
      successes: this.successes,
      attempts: this.attempts,
      level: this.level,
      levelChange: 'none',
    };
  }
}
