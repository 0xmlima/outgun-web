// SPDX-License-Identifier: GPL-2.0-or-later
// Uma sala: mundo autoritativo (`ServerSim`), conexões e o ciclo da partida, como o `Server` do
// original (src/server.cpp) para um único mapa em rotação. Times, votação, chat e validação de
// entrada chegam nos cards OG-043..047; aqui ficam entrar, sair, aplicar entradas, simular a 10 Hz,
// mandar a cada jogador só o que ele vê (OG-042, aoi.ts), fim de partida e troca de mapa.
import { encodeFrame, message, PROTOCOL_VERSION, type AnyMessage, type MessageOf } from '@outgun/protocol';
import { presetSettings, PRESETS, type GameMode, type GameSettings } from '@outgun/settings';
import { buildFrame, minimapViews, RecipientState, seesRocket } from './aoi.js';
import { InputGuard, isNewerOrSame } from './input-guard.js';
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
  /** Nome do arquivo de cada mapa (sem `.txt`), para o cliente baixar; padrão: o título. */
  mapFiles?: readonly string[] | undefined;
  /** Relógio em ms para medir quando os inputs chegam dentro do frame (padrão `performance.now`). */
  now?: () => number;
}

export type JoinResult = { ok: true; pid: number } | { ok: false; reason: MessageOf<'reject'>['reason']; text: string };

interface Client {
  conn: Connection;
  identity: Identity;
  lastClientFrame: number;
  /** Momento, em frames, em que o último input novo chegou depois do envio do frame (`frameOffset`). */
  frameOffset: number;
  /** Frags na última mensagem enviada (`oldfrags`). */
  sentFrags: number;
  /** Rodízio do minimapa e propriedades já informadas. */
  rs: RecipientState;
  /** Eventos só deste jogador, enviados com o próximo frame. */
  queue: AnyMessage[];
  /** Bytes enviados desde a entrada (medição de tráfego). */
  bytes: number;
  joinedFrame: number;
  /** Limite de taxa e validação das mensagens (OG-043). */
  guard: InputGuard;
  /** Já chegou algum `input` (o primeiro é aceito com qualquer número de frame). */
  hasInput: boolean;
  /** Último frame com ação do jogador (para o idle kick, RN-IDL-01). */
  lastActivityFrame: number;
}

const FLAG_TYPE = { [CarriedFlag.None]: 'none', [CarriedFlag.Own]: 'own', [CarriedFlag.Enemy]: 'enemy', [CarriedFlag.Wild]: 'wild' } as const;
const CAUSE = { [DamageType.rocket]: 'rocket', [DamageType.deathbringer]: 'deathbringer', [DamageType.collision]: 'collision' } as const;
const FLAG_TEAM = ['red', 'blue', 'wild'] as const;
/** Ações que contam como atividade do jogador (o idle kick do original olha os controles). */
function isActivity(m: AnyMessage): boolean {
  if (m.type === 'input') return (m.controls & 0x3f) !== 0;
  if (m.type === 'fire') return m.on;
  return m.type === 'suicide' || m.type === 'dropFlag' || m.type === 'changeTeam';
}

const POWERUP_KIND = ['shield', 'turbo', 'shadow', 'power', 'weapon', 'megahealth', 'deathbringer'] as const;

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
  /** Expulsões por `client_misbehavior` (para log e métricas). */
  readonly kicks: { pid: number; name: string; reason: string }[] = [];
  /** Jogadores que conhecem cada foguete (`Rocket::vislist`). */
  private readonly rocketViewers: Set<number>[] = [];
  private readonly now: () => number;
  /** Times cujas bandeiras mudaram no frame (um `flagUpdate` por time, antes do frame). */
  private readonly dirtyFlags = new Set<number>();
  /** Quando o último frame foi enviado (`frameSentTime`), em ms. */
  private frameSentTime = 0;

  constructor(private readonly options: RoomOptions) {
    const preset = PRESETS.find((p) => p.id === options.preset);
    if (!preset) throw new Error(`preset desconhecido: ${options.preset}`);
    if (options.maps.length === 0) throw new Error('rotação de mapas vazia');
    if (options.maxPlayers % 2 !== 0 || options.maxPlayers < 2 || options.maxPlayers > 32) throw new Error(`max_players inválido: ${options.maxPlayers}`);
    this.id = options.id;
    this.mode = preset.mode;
    this.settings = presetSettings(preset.id);
    this.maps = options.maps;
    this.now = options.now ?? (() => performance.now());
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
      rocketsFired: (owner, rids, gunDir, power, pos) => {
        // quem vê o tiro fica guardado no foguete (`vislist`) para a remoção e as trocas de sala
        const viewers = this.viewers((p) => seesRocket(this.world, this.settings, p, pos.roomX, pos.roomY));
        for (const rid of rids) this.rocketViewers[rid] = new Set(viewers);
        const msg = message('rocketFire', { owner, rockets: [...rids], gundir: iround(gunDir * 256) % 2048, frame: this.world.frame, power, roomX: pos.roomX, roomY: pos.roomY, x: pos.x, y: pos.y });
        for (const pid of viewers) this.queueTo(pid, msg);
      },
      rocketRemoved: (rid, x, y, target) => {
        const msg = message('rocketDelete', { rocket: rid, target: target < 0 ? 255 : target, x, y });
        for (const pid of this.rocketViewers[rid] ?? []) this.queueTo(pid, msg);
        this.rocketViewers[rid] = new Set();
      },
      powerupAppeared: (index) => {
        const it = this.world.items[index]!;
        for (const pid of this.viewers((p) => p.pos.sameRoom(it.pos))) this.queueTo(pid, this.powerupVisible(index));
      },
      powerupPicked: (index, pos) => {
        for (const pid of this.viewers((p) => p.pos.sameRoom(pos))) this.queueTo(pid, message('powerupPicked', { id: index }));
      },
      playerScreenChange: (pid) => this.screenChanged(pid),
      flagsChanged: (team) => this.dirtyFlags.add(team),
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

    this.clients.set(pid, { conn, identity, lastClientFrame: 0, frameOffset: 0, sentFrags: 0, rs: new RecipientState(), queue: [], bytes: 0, joinedFrame: this.world.frame, guard: new InputGuard(), hasInput: false, lastActivityFrame: this.world.frame });
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
      message('mapChange', { reason: 'other', mapIndex: this.mapIndex, file: this.mapFile(this.mapIndex), title: this.world.map.title, crc: this.world.map.crc }),
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
    if (!this.clients.has(pid)) return;
    this.sim.removePlayer(pid); // apaga os foguetes do jogador para quem os via
    this.clients.delete(pid);
    for (const viewers of this.rocketViewers) viewers?.delete(pid);
    this.broadcast(message('playerLeft', { pid }));
  }

  /** Mensagens de um cliente, na ordem (`incoming_client_data` + `processMessage`). */
  handle(pid: number, messages: AnyMessage[]): void {
    const pl = this.world.players[pid];
    const client = this.clients.get(pid);
    if (!pl || !client) return;
    for (const m of messages) {
      const verdict = client.guard.check(m);
      if (!verdict.ok) {
        this.kick(pid, verdict.reason);
        return;
      }
      if (isActivity(m)) client.lastActivityFrame = this.world.frame;
      switch (m.type) {
        case 'input': {
          // fora de ordem ou duplicado antigo: ignora (`incoming_client_data`)
          if (client.hasInput && !isNewerOrSame(client.lastClientFrame, m.clientFrame)) break;
          // chegada de um frame novo do cliente dentro do frame do servidor (servnet.cpp:1840)
          if (!client.hasInput || m.clientFrame !== client.lastClientFrame) client.frameOffset = ((this.now() - this.frameSentTime) * 10) / 1000;
          client.hasInput = true;
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
        case 'minimapBandwidth':
          client.rs.minimapPerFrame = Math.min(32, m.playersPerFrame);
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

  /** Mensagem que nem decodificou (formato inválido): expulsão. */
  misbehaved(pid: number, reason: string): void {
    this.kick(pid, reason);
  }

  /** Expulsa por mensagem inválida ou excesso (`disconnect_client_misbehavior`). */
  private kick(pid: number, reason: string): void {
    const c = this.clients.get(pid);
    if (!c) return;
    this.kicks.push({ pid, name: c.identity.name, reason });
    c.conn.send(encodeFrame(message('disconnecting', { reason: 'misbehavior', seconds: 0 })));
    c.conn.close(4003, 'client_misbehavior');
    this.leave(pid);
  }

  /** Último frame com ação de cada jogador (idle kick, OG-047). */
  lastActivity(pid: number): number | undefined {
    return this.clients.get(pid)?.lastActivityFrame;
  }

  /** Um frame (`simulate_and_broadcast_frame`). */
  tick(): void {
    const world = this.world;
    for (const c of this.clients.values()) c.guard.tick();
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
    const views = minimapViews(world, this.settings);
    for (const [pid, c] of this.clients) {
      const { frame, properties } = buildFrame(world, this.settings, views, pid, c.rs, { running, lastClientFrame: c.lastClientFrame, frameOffset: c.frameOffset, ping: null });
      const extra = properties.length ? [message('minimapProperties', { players: properties })] : [];
      this.send(pid, [...c.queue, message('frame', frame), ...extra]);
      c.queue = [];
    }
    this.frameSentTime = this.now();
    world.frame++;
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
      message('mapChange', { reason: reason === 'captureLimit' ? 'captureLimit' : 'timeOut', mapIndex: this.mapIndex, file: this.mapFile(this.mapIndex), title: map.title, crc: map.crc }),
      message('worldReset', {}),
    );
    for (const team of [0, 1, 2]) this.dirtyFlags.add(team); // bandeiras do mapa novo
  }

  private mapFile(index: number): string {
    return this.options.mapFiles?.[index] ?? (this.maps[index] as GameMap).title;
  }

  /** Eventos para todos: acumulados e enviados juntos, antes do próximo frame (canal confiável). */
  private broadcast(...messages: AnyMessage[]): void {
    this.outbox.push(...messages);
  }

  private flush(): void {
    for (const team of [...this.dirtyFlags].sort()) this.outbox.push(this.flagUpdate(team));
    this.dirtyFlags.clear();
    if (this.outbox.length === 0) return;
    const data = encodeFrame(...this.outbox);
    this.outbox = [];
    for (const c of this.clients.values()) c.conn.send(data);
  }

  private send(pid: number, messages: AnyMessage[]): void {
    const c = this.clients.get(pid);
    if (!c) return;
    const data = encodeFrame(...messages);
    c.bytes += data.length;
    c.conn.send(data);
  }

  /** Evento para um jogador só, junto do próximo frame. */
  private queueTo(pid: number, msg: AnyMessage): void {
    this.clients.get(pid)?.queue.push(msg);
  }

  /** Jogadores conectados que satisfazem `test`. */
  private viewers(test: (p: PlayerState) => boolean): number[] {
    return [...this.clients.keys()].filter((pid) => {
      const p = this.world.players[pid];
      return p !== undefined && test(p);
    });
  }

  private powerupVisible(index: number): AnyMessage {
    const it = this.world.items[index]!;
    return message('powerupVisible', { id: index, kind: POWERUP_KIND[it.kind as 0], roomX: it.pos.roomX, roomY: it.pos.roomY, x: Math.trunc(it.pos.x), y: Math.trunc(it.pos.y) });
  }

  /** `game_player_screen_change`: power-ups da nova sala e foguetes que ele passa a ver. */
  private screenChanged(pid: number): void {
    const pl = this.world.players[pid];
    if (!pl || !this.clients.has(pid)) return;
    this.world.items.forEach((it, i) => {
      if (it.isReal() && it.pos.sameRoom(pl.pos)) this.queueTo(pid, this.powerupVisible(i));
    });
    this.world.rockets.forEach((rk, rid) => {
      const viewers = (this.rocketViewers[rid] ??= new Set());
      if (rk.owner === -1 || viewers.has(pid) || !seesRocket(this.world, this.settings, pl, rk.pos.roomX, rk.pos.roomY)) return;
      viewers.add(pid);
      this.queueTo(pid, message('rocketVisible', { rocket: rid, team: rk.team === 0 ? 'red' : 'blue', power: rk.power, gundir: iround(rk.direction * 256) % 2048, frame: this.world.frame, roomX: rk.pos.roomX, roomY: rk.pos.roomY, x: Math.trunc(rk.pos.x), y: Math.trunc(rk.pos.y) }));
    });
  }

  /** Tráfego médio por cliente (bytes/s) desde que cada um entrou. */
  traffic(): { clients: number; avgBytesPerSecond: number; maxBytesPerSecond: number } {
    const rates = [...this.clients.values()].map((c) => (c.bytes * 10) / Math.max(1, this.world.frame - c.joinedFrame));
    return {
      clients: rates.length,
      avgBytesPerSecond: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0,
      maxBytesPerSecond: rates.length ? Math.max(...rates) : 0,
    };
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
