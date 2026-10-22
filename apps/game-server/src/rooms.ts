// SPDX-License-Identifier: GPL-2.0-or-later
// Salas do processo: um único loop de 10 Hz avança todas (como um servidor do original por sala,
// mas várias por processo) e encerra as vazias depois de um tempo.
import type { GameMap } from '@outgun/sim';
import { FixedRateLoop, percentile, realClock, type Clock } from './loop.js';
import { Room, type CasualBots, type RoomOptions } from './room.js';
import type { RandomMapParams } from './generated-maps.js';
import type { RankedRoomFormat } from '@outgun/settings';
import type { LobbyPhase } from './ranked-lobby.js';

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
  /** Entradas `random_map` alinhadas com `maps` (OG-015). */
  randomSlots?: readonly (RandomMapParams | null)[];
  /** Formato e série da sala Ranked (OG-250). */
  ranked?: RankedRoomFormat;
  /** Bots da sala privada Casual escolhidos pelo dono (OG-289). */
  casualBots?: CasualBots;
  /** Mapas que a sala Casual escolheu (D-69): quando a rotação muda, ficam os que seguem nela. */
  chosenMaps?: readonly string[];
}

interface Entry {
  room: Room;
  name: string;
  persistent: boolean;
  emptySince: number | null;
  chosenMaps: readonly string[] | null;
}

export interface ManagerOptions {
  /** Sala vazia é encerrada depois deste tempo (ms). */
  emptyTimeoutMs: number;
  clock?: Clock;
  /** Semente das salas (testes); padrão: aleatória por sala. */
  seed?: () => number;
  /** Auditoria, filtro do chat e log, iguais para todas as salas (OG-046). */
  roomDefaults?: Pick<RoomOptions, 'audit' | 'chatFilter' | 'log' | 'onMisbehavior' | 'reportPlayer' | 'generatedMaps' | 'mapText' | 'reconnectSeconds' | 'reportMatch' | 'maxSpectators' | 'gamemod' | 'botsFill' | 'replays'>;
  /** Quantas salas o processo hospeda no máximo (as abertas sob demanda; padrão: sem limite). */
  maxRooms?: number;
  /** Recebe a duração de cada tick e os erros das salas (métricas, OG-102). */
  observer?: TickObserver;
}

/** Medições do loop para as métricas (OG-102). Tempos em ms. */
export interface TickObserver {
  /** Um tick de todas as salas: duração e atraso em relação ao horário ideal. */
  tick(durationMs: number, latenessMs: number): void;
  /** Um tick de uma sala (simulação + serialização). */
  roomTick(durationMs: number): void;
  /** A sala lançou exceção no tick; as outras salas seguem. */
  roomError(roomId: string, error: unknown): void;
  /** Inputs de jogadores no tick (OG-369): espera de cada mudança até o tick (ms) e mudanças sobrescritas. */
  input?(waitsMs: readonly number[], overwritten: number): void;
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
  /** Jogadores, para o painel admin (OG-087). */
  roster: ReturnType<Room['roster']>;
  /** Fase do lobby Ranked (OG-252). */
  phase?: LobbyPhase;
}

export class RoomManager {
  private readonly rooms = new Map<string, Entry>();
  private readonly clock: Clock;
  readonly loop: FixedRateLoop;
  /** Duração do processamento de cada tick (ms), para métricas. */
  private readonly tickCosts: number[] = [];
  /** Métricas do loop (OG-102); pode ser ligado depois de criar o gerenciador. */
  observer: TickObserver | undefined;

  constructor(private readonly options: ManagerOptions) {
    this.clock = options.clock ?? realClock;
    this.observer = options.observer;
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
    const room = new Room({ ...this.options.roomDefaults, id: spec.id, preset: spec.preset, maps: spec.maps, mapFiles: spec.mapFiles, ...(spec.randomSlots ? { randomSlots: spec.randomSlots } : {}), maxPlayers: spec.maxPlayers, ...(spec.ranked ? { ranked: spec.ranked } : {}), ...(spec.casualBots ? { casualBots: spec.casualBots } : {}), seed, now: () => this.clock.now(), ...(spec.reconnectSeconds !== undefined ? { reconnectSeconds: spec.reconnectSeconds } : {}) });
    this.rooms.set(spec.id, { room, name: spec.name ?? spec.id, persistent: spec.persistent ?? false, emptySince: null, chosenMaps: spec.chosenMaps ?? null });
    return room;
  }

  get maxRooms(): number {
    return this.options.maxRooms ?? 1000;
  }

  /** Cabe mais uma sala aberta sob demanda (nunca durante a drenagem). */
  get hasCapacity(): boolean {
    return !this.draining && this.rooms.size < this.maxRooms;
  }

  /** Desligando (OG-103): sem salas novas; as atuais fecham no fim da partida. */
  draining = false;

  /**
   * Drena o processo: cada sala termina a partida em andamento e fecha; resolve quando não sobra
   * sala ou depois de `timeoutMs` (aí fecha as que restam, como o `stop`).
   */
  drain(timeoutMs: number): Promise<void> {
    this.draining = true;
    for (const { room } of this.rooms.values()) room.drain();
    return new Promise((resolve) => {
      const started = this.clock.now();
      const check = () => {
        if (this.rooms.size === 0 || this.clock.now() - started >= timeoutMs) {
          this.stop();
          return resolve();
        }
        this.clock.setTimeout(check, 250);
      };
      check();
    });
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
      roster: room.roster(),
      ...(room.lobby ? { phase: room.lobby.phase } : {}),
    }));
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id)?.room;
  }

  /** Mapas escolhidos pela sala (D-69); null = segue a rotação inteira. */
  chosenMaps(id: string): readonly string[] | null {
    return this.rooms.get(id)?.chosenMaps ?? null;
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
    const observer = this.observer;
    for (const [id, entry] of this.rooms) {
      if (entry.room.finished) {
        this.close(id);
        continue;
      }
      if (observer) {
        const start = this.clock.now();
        try {
          entry.room.tick();
        } catch (error) {
          observer.roomError(id, error);
        }
        observer.roomTick(this.clock.now() - start);
        if (observer.input) {
          const s = entry.room.drainInputStats();
          observer.input(s.waits, s.overwritten);
        }
      } else entry.room.tick();
      if (entry.room.playerCount > 0 || entry.persistent) entry.emptySince = null;
      else if (entry.emptySince === null) entry.emptySince = now;
      else if (now - entry.emptySince >= this.options.emptyTimeoutMs) this.close(id);
    }
    const cost = this.clock.now() - begin;
    observer?.tick(cost, this.loop.stats.lastLateness);
    this.tickCosts.push(cost);
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
