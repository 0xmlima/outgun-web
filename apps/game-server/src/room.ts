// SPDX-License-Identifier: GPL-2.0-or-later
// Uma sala: mundo autoritativo (`ServerSim`), conexões e o ciclo da partida, como o `Server` do
// original (src/server.cpp) para um único mapa em rotação. Times, votação, chat, AOI completo e
// validação de entrada chegam nos cards OG-042..047; aqui fica o núcleo: entrar, sair, aplicar
// entradas, simular a 10 Hz, mandar frames e eventos, fim de partida e troca de mapa.
import { encodeFrame, message, PROTOCOL_VERSION, type AnyMessage, type MessageOf } from '@outgun/protocol';
import { presetSettings, PRESETS, type GameMode, type GameSettings } from '@outgun/settings';
import {
  CarriedFlag,
  clearModifiersIfIdle,
  DamageType,
  GlibcRand,
  gunDirectionFromControls,
  iround,
  isStrafe,
  ServerSim,
  WorldState,
  type GameMap,
  type GameOverReason,
  type MatchResult,
  type PlayerState,
} from '@outgun/sim';

export interface Connection {
  send(data: Uint8Array): void;
  close(code: number, reason: string): void;
}

export interface Identity {
  name: string;
  /** Conta da API; null = convidado. */
  accountId: string | null;
}

export interface RoomOptions {
  id: string;
  preset: string;
  maps: GameMap[];
  /** Vagas (par, 2..32; RN-TIM-04). */
  maxPlayers: number;
  seed: number;
}

export type JoinResult = { ok: true; pid: number } | { ok: false; reason: MessageOf<'reject'>['reason']; text: string };

interface Client {
  conn: Connection;
  identity: Identity;
  lastClientFrame: number;
  /** Frags na última mensagem enviada (`oldfrags`). */
  sentFrags: number;
}

const FLAG_TYPE = { [CarriedFlag.None]: 'none', [CarriedFlag.Own]: 'own', [CarriedFlag.Enemy]: 'enemy', [CarriedFlag.Wild]: 'wild' } as const;
const CAUSE = { [DamageType.rocket]: 'rocket', [DamageType.deathbringer]: 'deathbringer', [DamageType.collision]: 'collision' } as const;
const FLAG_TEAM = ['red', 'blue', 'wild'] as const;

export class Room {
  readonly id: string;
  readonly settings: GameSettings;
  readonly mode: GameMode;
  readonly world: WorldState;
  readonly sim: ServerSim;
  readonly results: MatchResult[] = [];
  private readonly clients = new Map<number, Client>();
  private readonly maps: GameMap[];
  private mapIndex = 0;
  /** Placar de fim de partida: até este frame o mundo não é simulado. */
  private gameOverUntil: number | null = null;
  private outbox: AnyMessage[] = [];

  constructor(private readonly options: RoomOptions) {
    const preset = PRESETS.find((p) => p.id === options.preset);
    if (!preset) throw new Error(`preset desconhecido: ${options.preset}`);
    if (options.maps.length === 0) throw new Error('rotação de mapas vazia');
    if (options.maxPlayers % 2 !== 0 || options.maxPlayers < 2 || options.maxPlayers > 32) throw new Error(`max_players inválido: ${options.maxPlayers}`);
    this.id = options.id;
    this.mode = preset.mode;
    this.settings = presetSettings(preset.id);
    this.maps = options.maps;
    this.world = new WorldState(options.maps[0] as GameMap, options.maxPlayers);
    this.sim = new ServerSim(this.world, this.settings, new GlibcRand(options.seed), {
      kill: (attacker, target, cause, carried, carrierDefended, flagDefended) =>
        this.broadcast(message('kill', { attacker: attacker & 31, target, cause: CAUSE[cause], carriedFlag: FLAG_TYPE[carried], carrierDefended, flagDefended })),
      suicide: (pid, flag) => this.broadcast(message('suicideEvent', { pid, carriedFlag: FLAG_TYPE[flag] })),
      flagTaken: (pid, flag) => this.broadcast(message('flagTake', { pid, flag: FLAG_TYPE[flag] })),
      flagDropped: (pid, flag, captureDrop) => this.broadcast(message('flagDrop', { pid, flag: FLAG_TYPE[flag], captureDrop })),
      flagReturned: (pid) => this.broadcast(message('flagReturn', { pid })),
      flagCaptured: (pid, flagTeam, assistant) => this.broadcast(message('capture', { pid, flagTeam: FLAG_TEAM[flagTeam] as 'red', assistant: assistant === -1 ? 255 : assistant })),
      playerSpawned: (pid) => this.broadcast(message('spawn', { pid })),
      timeWarning: (s) => this.broadcast(message('timeEvent', { kind: s === 300 ? 'fiveMinutesLeft' : s === 60 ? 'oneMinuteLeft' : 'thirtySecondsLeft' })),
      normalTimeOut: (sd) => this.broadcast(message('timeEvent', { kind: sd ? 'normalTimeOutSuddenDeath' : 'normalTimeOut' })),
      gameOver: (reason, result) => this.onGameOver(reason, result),
    });
    this.sim.loadMapFlags();
    this.sim.startGame();
  }

  get playerCount(): number {
    return this.clients.size;
  }

  get frame(): number {
    return this.world.frame;
  }

  /** Entrada na sala (`client_connected`): time com menos jogadores, menor pid livre. */
  join(conn: Connection, identity: Identity): JoinResult {
    if (this.mode === 'ranked' && identity.accountId === null) return { ok: false, reason: 'rankedNeedsAccount', text: 'Salas Ranked exigem login.' };
    const size = this.world.teamSize;
    const counts = [0, 1].map((t) => this.world.players.slice(t * size, (t + 1) * size).filter(Boolean).length);
    const order = (counts[0] as number) <= (counts[1] as number) ? [0, 1] : [1, 0];
    let pid = -1;
    for (const t of order) {
      const free = this.world.players.slice(t * size, (t + 1) * size).findIndex((p) => !p);
      if (free !== -1) {
        pid = t * size + free;
        break;
      }
    }
    if (pid === -1) return { ok: false, reason: 'serverFull', text: 'Sala cheia.' };

    this.clients.set(pid, { conn, identity, lastClientFrame: 0, sentFrags: 0 });
    this.sim.addPlayer(pid);
    this.send(pid, this.welcomeMessages(pid));
    this.broadcast(message('playerJoined', { pid, name: identity.name, color: 0, bot: false }));
    // segundo jogador: a partida recomeça (`client_connected` com player_count == 2)
    if (this.clients.size === 2) {
      this.sim.returnAllFlags();
      this.sim.resetWorld();
      this.world.mapStartFrame = this.world.frame;
      this.broadcast(message('worldReset', {}), message('startGame', {}));
    }
    return { ok: true, pid };
  }

  private welcomeMessages(pid: number): AnyMessage[] {
    const preset = this.options.preset;
    const out: AnyMessage[] = [
      message('welcome', { protocol: PROTOCOL_VERSION, pid, color: 0, maxPlayers: this.world.maxPlayers, mode: this.mode, mapIndex: this.mapIndex, redScore: this.world.teams[0].score, blueScore: this.world.teams[1].score }),
      message('serverSettings', { preset, gamemod: (PRESETS.find((p) => p.id === preset)?.overrides ?? ''), locked: PRESETS.find((p) => p.id === preset)?.locked ?? false }),
      message('mapChange', { reason: 'other', mapIndex: this.mapIndex, file: this.world.map.title, title: this.world.map.title, crc: this.world.map.crc }),
      message('playersPresent', { pids: [...this.clients.keys()] }),
    ];
    for (const [other, c] of this.clients) {
      if (other === pid) continue;
      out.push(message('playerJoined', { pid: other, name: c.identity.name, color: 0, bot: false }));
      out.push(message('frags', { pid: other, frags: (this.world.players[other] as PlayerState).stats.frags }));
    }
    for (const team of [0, 1, 2]) out.push(this.flagUpdate(team));
    return out;
  }

  private flagUpdate(team: number): AnyMessage {
    return message('flagUpdate', {
      team: FLAG_TEAM[team] as 'red',
      flags: this.world.flagsOf(team).map((f) => ({
        carried: f.status === 'carried',
        carrier: f.status === 'carried' ? f.carrier : 255,
        roomX: f.pos.roomX,
        roomY: f.pos.roomY,
        x: Math.trunc(f.pos.x),
        y: Math.trunc(f.pos.y),
      })),
    });
  }

  /** Saída (`client_disconnected` → `removePlayer`). */
  leave(pid: number): void {
    if (!this.clients.delete(pid)) return;
    this.sim.removePlayer(pid);
    this.broadcast(message('playerLeft', { pid }));
  }

  /** Mensagens de um cliente, na ordem (`incoming_client_data` + `processMessage`). */
  handle(pid: number, messages: AnyMessage[]): void {
    const pl = this.world.players[pid];
    const client = this.clients.get(pid);
    if (!pl || !client) return;
    for (const m of messages) {
      switch (m.type) {
        case 'input': {
          client.lastClientFrame = m.clientFrame;
          pl.controls = clearModifiersIfIdle(m.controls & 0x3f);
          pl.accelerationMode = (m.gundir & 0x800) !== 0 && this.settings.physics.allowFreeTurning ? 'gun' : 'world';
          if (!pl.dead) {
            if (this.settings.physics.allowFreeTurning) pl.gundir = (m.gundir & 0x7ff) / 256;
            else if (!isStrafe(pl.controls)) pl.gundir = gunDirectionFromControls(pl.gundir, pl.controls);
          }
          break;
        }
        case 'fire':
          if (m.on) {
            pl.attack = true;
            pl.attackOnce = true;
            pl.attackGunDir = pl.gundir;
          } else pl.attack = false;
          break;
        case 'dropFlag':
          this.sim.setDropKey(pid, m.on);
          break;
        case 'suicide':
          if (!pl.underDeathbringerEffect(this.world.time)) this.sim.suicide(pid);
          break;
        case 'clientReady':
          if (pl.awaitingClientReadies > 0) pl.awaitingClientReadies--;
          break;
        default:
          // times, votos, chat e opções: OG-044..047
          break;
      }
    }
    // quem segurava o tiro antes deste pacote atira na direção nova
    if (!pl.attackOnce) pl.attackGunDir = pl.gundir;
  }

  /** Um frame (`simulate_and_broadcast_frame`). */
  tick(): void {
    const world = this.world;
    if (this.gameOverUntil !== null && world.frame >= this.gameOverUntil) {
      this.gameOverUntil = null;
      this.sim.startGame();
      this.broadcast(message('startGame', {}));
    }
    const running = this.gameOverUntil === null;
    if (running) {
      world.time = world.frame / 10; // relógio determinístico (D-09)
      this.sim.simulateFrame();
      for (const [pid, c] of this.clients) {
        const frags = (world.players[pid] as PlayerState).stats.frags;
        if (frags !== c.sentFrags) {
          c.sentFrags = frags;
          this.broadcast(message('frags', { pid, frags }));
        }
      }
    }
    this.flush();
    for (const pid of this.clients.keys()) this.send(pid, [this.frameFor(pid, running)]);
    world.frame++;
  }

  /**
   * Frame de um jogador. Por enquanto: os jogadores na mesma sala, sem shadow nem minimapa
   * (AOI completo no OG-042).
   */
  private frameFor(pid: number, running: boolean): AnyMessage {
    const world = this.world;
    const me = world.players[pid] as PlayerState;
    const client = this.clients.get(pid) as Client;
    const skipped = !running || me.awaitingClientReadies > 0;
    const players = skipped
      ? []
      : world.players
          .filter((p): p is PlayerState => p !== undefined && p.pos.sameRoom(me.pos))
          .map((p) => ({
            pid: p.pid,
            x: p.pos.x,
            y: p.pos.y,
            vx: p.vel.x,
            vy: p.vel.y,
            dead: p.dead,
            deathbringer: p.deathbringer,
            deathbringerAffected: p.deathbringerEnd > world.time,
            shield: p.shield !== 0,
            turbo: p.turbo,
            power: p.power,
            controls: p.dead ? 0 : p.controls,
            gundir: iround(p.gundir * 256) % 2048, // `toNetworkLongForm`
            visibility: world.frame < p.startTakeDamageFrame ? (world.frame & 2 ? 128 : 220) : p.visibility,
          }));
    return message('frame', {
      frame: world.frame,
      lastClientFrame: client.lastClientFrame,
      frameOffset: 0,
      skipped,
      self: skipped
        ? null
        : { roomX: me.pos.roomX, roomY: me.pos.roomY, x: me.pos.x, y: me.pos.y, vx: me.vel.x, vy: me.vel.y, health: Math.round(me.health), energy: Math.round(me.energy) },
      players,
      minimap: [],
      ping: null,
    });
  }

  /** Fim de partida no meio do frame (`server_next_map`): próximo mapa da rotação e placar. */
  private onGameOver(reason: GameOverReason, result: MatchResult): void {
    this.results.push(result);
    this.mapIndex = (this.mapIndex + 1) % this.maps.length;
    const map = this.maps[this.mapIndex] as GameMap;
    this.sim.changeMap(map);
    const delayFrames = Math.round(this.settings.server.gameEndDelay * 10);
    this.gameOverUntil = this.world.frame + delayFrames;
    // todos precisam carregar o novo mapa (`send_map_change_message`)
    for (const p of this.world.players) if (p) p.awaitingClientReadies++;
    this.broadcast(
      message('gameOver', { reason, seconds: this.settings.server.gameEndDelay }),
      message('mapChange', { reason: reason === 'captureLimit' ? 'captureLimit' : 'timeOut', mapIndex: this.mapIndex, file: map.title, title: map.title, crc: map.crc }),
      message('worldReset', {}),
    );
  }

  /** Eventos para todos: acumulados e enviados juntos, antes do próximo frame (canal confiável). */
  private broadcast(...messages: AnyMessage[]): void {
    this.outbox.push(...messages);
  }

  private flush(): void {
    if (this.outbox.length === 0) return;
    const data = encodeFrame(...this.outbox);
    this.outbox = [];
    for (const c of this.clients.values()) c.conn.send(data);
  }

  private send(pid: number, messages: AnyMessage[]): void {
    this.clients.get(pid)?.conn.send(encodeFrame(...messages));
  }

  /** Encerra a sala: avisa e fecha todas as conexões. */
  close(): void {
    for (const pid of [...this.clients.keys()]) {
      const c = this.clients.get(pid) as Client;
      c.conn.send(encodeFrame(message('disconnecting', { reason: 'shutdown', seconds: 0 })));
      c.conn.close(1001, 'sala encerrada');
      this.leave(pid);
    }
  }
}
