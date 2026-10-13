// SPDX-License-Identifier: GPL-2.0-or-later
// Salas do processo: um único loop de 10 Hz avança todas (como um servidor do original por sala,
// mas várias por processo) e encerra as vazias depois de um tempo.
import type { GameMap } from '@outgun/sim';
import { FixedRateLoop, percentile, realClock, type Clock } from './loop.js';
import { Room, type RoomOptions } from './room.js';

export interface RoomSpec {
  id: string;
  /** Nome exibido no lobby (padrão: o id). */
  name?: string;
  preset: string;
  maps: GameMap[];
  /** Nome do arquivo de cada mapa (sem `.txt`). */
  mapFiles?: readonly string[];
  maxPlayers: number;
  /** Salas fixas não são encerradas quando ficam vazias. */
  persistent?: boolean;
  /** Vaga guardada para quem caiu (s); padrão do gerenciador ou 15. */
  reconnectSeconds?: number;
}

interface Entry {
  room: Room;
  name: string;
  persistent: boolean;
  emptySince: number | null;
}

export interface ManagerOptions {
  /** Sala vazia é encerrada depois deste tempo (ms). */
  emptyTimeoutMs: number;
  clock?: Clock;
  /** Semente das salas (testes); padrão: aleatória por sala. */
  seed?: () => number;
  /** Auditoria, filtro do chat e log, iguais para todas as salas (OG-046). */
  roomDefaults?: Pick<RoomOptions, 'audit' | 'chatFilter' | 'log' | 'reconnectSeconds'>;
  /** Quantas salas o processo hospeda no máximo (as abertas sob demanda; padrão: sem limite). */
  maxRooms?: number;
}

/** O que o heartbeat conta à API sobre cada sala (OG-086). */
export interface HostedRoom {
  id: string;
  name: string;
  mode: 'casual' | 'ranked';
  preset: string;
  maxPlayers: number;
  persistent: boolean;
  players: number;
  map: string;
}

export class RoomManager {
  private readonly rooms = new Map<string, Entry>();
  private readonly clock: Clock;
  readonly loop: FixedRateLoop;
  /** Duração do processamento de cada tick (ms), para métricas. */
  private readonly tickCosts: number[] = [];

  constructor(private readonly options: ManagerOptions) {
    this.clock = options.clock ?? realClock;
    this.loop = new FixedRateLoop(100, () => this.tickAll(), this.clock);
  }

  start(): void {
    this.loop.startLoop();
  }

  stop(): void {
    this.loop.stop();
    for (const id of [...this.rooms.keys()]) this.close(id);
  }

  create(spec: RoomSpec): Room {
    if (this.rooms.has(spec.id)) throw new Error(`sala já existe: ${spec.id}`);
    const seed = this.options.seed?.() ?? Math.floor(Math.random() * 2 ** 31);
    const room = new Room({ ...this.options.roomDefaults, id: spec.id, preset: spec.preset, maps: spec.maps, mapFiles: spec.mapFiles, maxPlayers: spec.maxPlayers, seed, now: () => this.clock.now(), ...(spec.reconnectSeconds !== undefined ? { reconnectSeconds: spec.reconnectSeconds } : {}) });
    this.rooms.set(spec.id, { room, name: spec.name ?? spec.id, persistent: spec.persistent ?? false, emptySince: null });
    return room;
  }

  get maxRooms(): number {
    return this.options.maxRooms ?? 1000;
  }

  /** Cabe mais uma sala aberta sob demanda. */
  get hasCapacity(): boolean {
    return this.rooms.size < this.maxRooms;
  }

  hosted(): HostedRoom[] {
    return [...this.rooms.values()].map(({ room, name, persistent }) => ({
      id: room.id,
      name,
      mode: room.mode,
      preset: room.presetId,
      maxPlayers: room.world.maxPlayers,
      persistent,
      players: room.playerCount,
      map: room.world.map.title,
    }));
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id)?.room;
  }

  list(): Room[] {
    return [...this.rooms.values()].map((e) => e.room);
  }

  close(id: string): void {
    const entry = this.rooms.get(id);
    if (!entry) return;
    entry.room.close();
    this.rooms.delete(id);
  }

  /** Um tick de todas as salas; depois, encerra as vazias há tempo demais. */
  tickAll(): void {
    const begin = this.clock.now();
    const now = begin;
    for (const [id, entry] of this.rooms) {
      entry.room.tick();
      if (entry.room.playerCount > 0 || entry.persistent) entry.emptySince = null;
      else if (entry.emptySince === null) entry.emptySince = now;
      else if (now - entry.emptySince >= this.options.emptyTimeoutMs) this.close(id);
    }
    this.tickCosts.push(this.clock.now() - begin);
    if (this.tickCosts.length > 600) this.tickCosts.shift();
  }

  /** Números para /health e /metrics. */
  metrics() {
    const s = this.loop.stats;
    return {
      rooms: this.rooms.size,
      players: this.list().reduce((n, r) => n + r.playerCount, 0),
      ticks: s.ticks,
      skippedTicks: s.skipped,
      latenessP50: percentile(s.recent, 50),
      latenessP99: percentile(s.recent, 99),
      latenessMax: s.maxLateness,
      tickCostP99: percentile(this.tickCosts, 99),
      // tráfego médio por cliente (bytes/s), ponderado pelo número de clientes de cada sala
      clientBytesPerSecond: (() => {
        const t = this.list().map((r) => r.traffic());
        const n = t.reduce((a, x) => a + x.clients, 0);
        return n ? t.reduce((a, x) => a + x.avgBytesPerSecond * x.clients, 0) / n : 0;
      })(),
    };
  }
}
