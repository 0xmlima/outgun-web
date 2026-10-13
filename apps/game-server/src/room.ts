// SPDX-License-Identifier: GPL-2.0-or-later
// Uma sala: mundo autoritativo (`ServerSim`), conexões e o ciclo da partida, como o `Server` do
// original (src/server.cpp) para um único mapa em rotação. Times, votação, chat e validação de
// entrada chegam nos cards OG-043..047; aqui ficam entrar, sair, aplicar entradas, simular a 10 Hz,
// mandar a cada jogador só o que ele vê (OG-042, aoi.ts), fim de partida e troca de mapa.
import { encodeFrame, message, PROTOCOL_VERSION, type AnyMessage, type MessageOf } from '@outgun/protocol';
import { presetSettings, PRESETS, type GameMode, type GameSettings } from '@outgun/settings';
import { buildFrame, minimapViews, RecipientState, seesRocket } from './aoi.js';
import { InputGuard, isNewerOrSame } from './input-guard.js';
import { announce, initialRotation, mapVotes, nextMap, shouldExit, type VoteAnnouncer, type Voter } from './map-vote.js';
import { balanceMoves, botToRebalance, botToRemove, ColorPool, freeSlot, joinTeam, NO_COLOR, shuffleSwaps, teamChangeFor, type Slot } from './teams.js';
import {
  CarriedFlag,
  clearModifiersIfIdle,
  DamageType,
  GlibcRand,
  gunDirectionFromControls,
  iround,
  isStrafe,
  randomShuffle,
  SAMPLES,
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
  /** O jogador mudou de pid (troca de time): o transporte passa a usar o novo. */
  moved?(pid: number): void;
}

/** Bots não têm conexão (a IA é do OG-048). */
const BOT_CONNECTION: Connection = { send: () => {}, close: () => {} };

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
  /** O que o HUD do jogador já recebeu: arma e fim de cada power-up com tempo (`data_weapon_change`, `data_pup_timer`). */
  hud: { weapon: number; turboTime: number; shadowTime: number; powerTime: number };
  bot: boolean;
  /** Pediu troca de time (Ctrl+End) e quando pode trocar de novo (s, `team_change_time`). */
  wantChangeTeams: boolean;
  teamChangeTime: number;
  /** Cores preferidas (`data_fav_colors`) e a cor pessoal atual (RN-TIM-05). */
  favColors: number[];
  color: number;
  /** Votação (RN-VOT): mapa votado (−1 = nenhum), quer sair do mapa, mapas que não quer. */
  mapVote: number;
  wantMapExit: boolean;
  negativeVotes: Set<number>;
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
  /** Rotação na ordem do servidor (`maprot`), com o frame do último jogo de cada mapa. */
  private readonly rotation: { map: GameMap; file: string; lastGame: number }[];
  private mapIndex = 0;
  /** Votos por mapa já enviados (`mapVotes` só quando mudam). */
  private sentVotes: number[] = [];
  private readonly announcer: VoteAnnouncer = { votes: 0, needed: 0, nextFrame: 0 };
  /** Placar de fim de partida: até este frame o mundo não é simulado. */
  private gameOverUntil: number | null = null;
  private outbox: AnyMessage[] = [];
  /** Expulsões por `client_misbehavior` (para log e métricas). */
  readonly kicks: { pid: number; name: string; reason: string }[] = [];
  /** Jogadores que conhecem cada foguete (`Rocket::vislist`). */
  private readonly rocketViewers: Set<number>[] = [];
  private readonly now: () => number;
  private readonly colors: ColorPool;
  /** Placar já enviado (`scoreUpdate` só quando muda). */
  private readonly sentScores: [number, number] = [0, 0];
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

    this.now = options.now ?? (() => performance.now());
    const rng = new GlibcRand(options.seed);
    // `random_maprot`: em ordem, embaralhada ou com o primeiro sorteado (RN-VOT-04)
    const { order, first } = initialRotation(options.maps.length, this.settings.server.randomMaprot, rng);
    this.rotation = order.map((i) => ({ map: options.maps[i] as GameMap, file: options.mapFiles?.[i] ?? (options.maps[i] as GameMap).title, lastGame: 0 }));
    this.mapIndex = first;
    this.world = new WorldState((this.rotation[first] as { map: GameMap }).map, options.maxPlayers);
    this.sim = new ServerSim(this.world, this.settings, rng, {
      kill: (attacker, target, cause, carried, carrierDefended, flagDefended) =>
        this.broadcast(message('kill', { attacker: attacker & 31, target, cause: CAUSE[cause], carriedFlag: FLAG_TYPE[carried], carrierDefended, flagDefended })),
      suicide: (pid, flag) => this.broadcast(message('suicideEvent', { pid, carriedFlag: FLAG_TYPE[flag] })),
      flagTaken: (pid, flag) => this.broadcast(message('flagTake', { pid, flag: FLAG_TYPE[flag] })),
      flagDropped: (pid, flag, captureDrop) => this.broadcast(message('flagDrop', { pid, flag: FLAG_TYPE[flag], captureDrop })),
      flagReturned: (pid) => this.broadcast(message('flagReturn', { pid })),
      flagCaptured: (pid, flagTeam, assistant) => this.broadcast(message('capture', { pid, flagTeam: FLAG_TEAM[flagTeam] as 'red', assistant: assistant === -1 ? 255 : assistant })),
      playerSpawned: (pid) => this.broadcast(message('spawn', { pid })),
      timeWarning: (s) => this.broadcast(message('timeEvent', { kind: s === 300 ? 'fiveMinutesLeft' : s === 60 ? 'oneMinuteLeft' : 'thirtySecondsLeft' })),
      normalTimeOut: (sd) => this.broadcast(message('timeEvent', { kind: sd ? 'normalTimeOutSuddenDeath' : 'normalTimeOut' }), this.mapTimeMessage()),
      extraTimePeriodStarted: () => this.broadcast(this.mapTimeMessage()),
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
      screenSample: (pid, sample) => {
        const pl = this.world.players[pid];
        if (!pl) return;
        const msg = message('sound', { sample: SAMPLES.indexOf(sample) });
        for (const other of this.viewers((p) => p.pos.sameRoom(pl.pos))) this.queueTo(other, msg);
      },
    });
    this.colors = new ColorPool(this.sim.rng);
    this.sim.loadMapFlags();
    this.sim.startGame();
  }

  get playerCount(): number {
    return this.clients.size;
  }

  get frame(): number {
    return this.world.frame;
  }

  /**
   * Entrada na sala (`client_connected`, RN-TIM-01): sala cheia com bot → um bot sai; time pela
   * regra de entrada; primeira vaga livre do time; cor pessoal livre.
   */
  join(conn: Connection, identity: Identity, opts: { bot?: boolean } = {}): JoinResult {
    if (this.mode === 'ranked' && identity.accountId === null) return { ok: false, reason: 'rankedNeedsAccount', text: 'Salas Ranked exigem login.' };
    if (opts.bot && this.mode === 'ranked') return { ok: false, reason: 'roomClosed', text: 'Bots são proibidos no Ranked (D-11).' };
    if (this.clients.size >= this.world.maxPlayers) {
      const bot = opts.bot ? -1 : botToRemove(this.slots(), this.world.maxPlayers);
      if (bot === -1) return { ok: false, reason: 'serverFull', text: 'Sala cheia.' };
      this.removeBot(bot);
    }
    const team = joinTeam(this.slots(), this.world.maxPlayers, () => this.lessScoredTeam());
    const pid = freeSlot(this.slots(), this.world.maxPlayers, team);
    if (pid === -1) return { ok: false, reason: 'serverFull', text: 'Sala cheia.' };
    const color = this.colors.assign(team, NO_COLOR, []);
    this.clients.set(pid, {
      conn,
      identity,
      lastClientFrame: 0,
      frameOffset: 0,
      sentFrags: 0,
      rs: new RecipientState(),
      queue: [],
      bytes: 0,
      joinedFrame: this.world.frame,
      guard: new InputGuard(),
      hasInput: false,
      lastActivityFrame: this.world.frame,
      hud: { weapon: 0, turboTime: 0, shadowTime: 0, powerTime: 0 },
      bot: opts.bot ?? false,
      wantChangeTeams: false,
      teamChangeTime: 0,
      favColors: [],
      color,
      mapVote: -1,
      wantMapExit: false,
      negativeVotes: new Set(),
    });
    const pl = this.sim.addPlayer(pid);
    if (opts.bot) pl.awaitingClientReadies = 0; // bot não carrega mapa
    this.send(pid, this.welcomeMessages(pid));
    this.broadcast(message('playerJoined', { pid, name: identity.name, color, bot: opts.bot ?? false }));
    // segundo jogador: a partida recomeça (`client_connected` com player_count == 2)
    if (this.clients.size === 2) {
      this.sim.returnAllFlags();
      this.sim.resetWorld();
      this.world.mapStartFrame = this.world.frame;
      this.broadcast(message('worldReset', {}), message('startGame', {}), this.mapTimeMessage());
    }
    return { ok: true, pid };
  }

  private welcomeMessages(pid: number): AnyMessage[] {
    const preset = this.options.preset;
    const out: AnyMessage[] = [
      message('welcome', { protocol: PROTOCOL_VERSION, pid, color: this.clients.get(pid)?.color ?? 0, maxPlayers: this.world.maxPlayers, mode: this.mode, mapIndex: this.mapIndex, redScore: this.world.teams[0].score, blueScore: this.world.teams[1].score }),
      message('serverSettings', { preset, gamemod: (PRESETS.find((p) => p.id === preset)?.overrides ?? ''), locked: PRESETS.find((p) => p.id === preset)?.locked ?? false }),
      message('mapChange', { reason: 'other', mapIndex: this.mapIndex, file: this.mapFile(this.mapIndex), title: this.world.map.title, crc: this.world.map.crc }),
      message('playersPresent', { pids: [...this.clients.keys()] }),
      this.mapTimeMessage(),
      this.mapListMessage(),
      message('currentMap', { mapIndex: this.mapIndex }),
    ];
    for (const [other, c] of this.clients) {
      if (other === pid) continue;
      out.push(message('playerJoined', { pid: other, name: c.identity.name, color: c.color, bot: c.bot }));
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
    const c = this.clients.get(pid);
    if (!c) return;
    this.sim.removePlayer(pid); // apaga os foguetes do jogador para quem os via
    this.colors.release(this.world.teamOf(pid), c.color);
    this.clients.delete(pid);
    for (const viewers of this.rocketViewers) viewers?.delete(pid);
    this.broadcast(message('playerLeft', { pid }));
    this.checkTeamChanges();
    this.checkMapExit();
  }

  /** Bot marcado (sem IA até o OG-048): ocupa uma vaga e dá lugar a humanos. */
  addBot(name: string): JoinResult {
    return this.join(BOT_CONNECTION, { name, accountId: null }, { bot: true });
  }

  /** `remove_bot` → `disconnectPlayer(kick)`. */
  removeBot(pid: number): void {
    if (this.clients.get(pid)?.bot) this.leave(pid);
  }

  /** Bots presentes (pids). */
  bots(): number[] {
    return [...this.clients].filter(([, c]) => c.bot).map(([pid]) => pid);
  }

  /** Cada vaga para as regras de time (`teams.ts`). */
  private slots(): (Slot | undefined)[] {
    return this.world.players.map((p, pid) => {
      const c = this.clients.get(pid);
      return p && c ? { bot: c.bot, dead: p.dead, hasFlag: p.stats.carriedFlag !== CarriedFlag.None, wantChange: c.wantChangeTeams } : undefined;
    });
  }

  /** `getLessScoredTeam` sem o ranking (OG-084): menor placar, senão sorteio. */
  private lessScoredTeam(): 0 | 1 {
    const [red, blue] = [this.world.teams[0].score, this.world.teams[1].score];
    if (red < blue) return 0;
    if (blue < red) return 1;
    return (this.sim.rng.rand() % 2) as 0 | 1;
  }

  /** Relógio dos pedidos de troca (s); o original usa `get_time()`. */
  private get clock(): number {
    return this.world.frame / 10;
  }

  /** `check_team_changes`: pedidos em ordem aleatória. */
  private checkTeamChanges(): void {
    const order = [...this.clients].filter(([, c]) => c.wantChangeTeams).map(([pid]) => pid);
    randomShuffle(order, this.sim.rng);
    for (const pid of order) this.checkPlayerChangeTeams(pid);
  }

  /** `check_player_change_teams` (RN-TIM-02). */
  private checkPlayerChangeTeams(pid: number): void {
    const c = this.clients.get(pid);
    if (!c?.wantChangeTeams || this.clock < c.teamChangeTime) return;
    const change = teamChangeFor(this.slots(), this.world.maxPlayers, pid);
    if (change?.kind === 'move') this.movePlayer(change.from, change.to);
    else if (change?.kind === 'swap') this.swapPlayers(change.a, change.b);
  }

  /** Depois da troca: não quer mais trocar por 10 s e ganha uma cor livre no time novo. */
  private settle(pid: number): void {
    const c = this.clients.get(pid) as Client;
    c.wantChangeTeams = false;
    c.teamChangeTime = this.clock + 10;
    c.color = this.colors.assign(this.world.teamOf(pid), NO_COLOR, c.favColors);
    c.conn.moved?.(pid);
  }

  /** `move_player`: para a vaga livre `to` do outro time. */
  private movePlayer(from: number, to: number): void {
    const c = this.clients.get(from) as Client;
    this.colors.release(this.world.teamOf(from), c.color);
    c.color = NO_COLOR;
    this.sim.movePlayer(from, to);
    this.clients.delete(from);
    this.clients.set(to, c);
    for (const viewers of this.rocketViewers)
      if (viewers?.delete(from)) viewers.add(to);
    this.settle(to);
    this.broadcast(message('teamChange', { from, to, color: c.color, swappedColor: 255 }));
  }

  /** `swap_players`. */
  private swapPlayers(a: number, b: number): void {
    const ca = this.clients.get(a) as Client;
    const cb = this.clients.get(b) as Client;
    this.colors.release(this.world.teamOf(a), ca.color);
    this.colors.release(this.world.teamOf(b), cb.color);
    ca.color = cb.color = NO_COLOR;
    this.sim.swapPlayers(a, b);
    this.clients.set(a, cb);
    this.clients.set(b, ca);
    for (const viewers of this.rocketViewers) {
      if (!viewers || viewers.has(a) === viewers.has(b)) continue;
      const [had, now] = viewers.has(a) ? [a, b] : [b, a];
      viewers.delete(had);
      viewers.add(now);
    }
    this.settle(a);
    this.settle(b);
    this.broadcast(message('teamChange', { from: a, to: b, color: ca.color, swappedColor: cb.color }));
  }

  /** `server_think_after_broadcast`: pedidos vencidos e bot que equilibra os times. */
  private thinkAfterBroadcast(): void {
    for (const [pid, c] of [...this.clients]) if (c.wantChangeTeams && c.teamChangeTime < this.clock) this.checkPlayerChangeTeams(pid);
    const bot = botToRebalance(this.slots(), this.world.maxPlayers);
    const c = bot === -1 ? undefined : this.clients.get(bot);
    if (!c) return;
    c.wantChangeTeams = true;
    c.teamChangeTime = 0;
    this.checkPlayerChangeTeams(bot);
  }

  /** `balance_teams` e `shuffle_teams` a cada mapa (RN-TIM-03). */
  private balanceTeams(): void {
    const mode = this.settings.world.balanceTeams;
    if (mode === 'no') return;
    for (const { from, to } of balanceMoves(this.slots(), this.world.maxPlayers, this.sim.rng)) this.movePlayer(from, to);
    if (mode === 'shuffle') for (const [a, b] of shuffleSwaps(this.slots(), this.world.maxPlayers, this.sim.rng)) this.swapPlayers(a, b);
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
        case 'chat':
          // até 200 caracteres imprimíveis; fora disso é mensagem inválida (`data_text_message`)
          if (m.text.length > 200 || [...m.text].some((ch) => ch < ' ' || ch === '\x7f')) return this.kick(pid, 'chat inválido');
          this.chat(pid, m.text);
          break;
        case 'changeTeam':
          if (!m.on) client.wantChangeTeams = false;
          else if (!client.wantChangeTeams) {
            client.wantChangeTeams = true;
            this.checkTeamChanges();
          }
          break;
        case 'favoriteColors': {
          client.favColors = m.colors.filter((c) => c < 16);
          const color = this.colors.assign(this.world.teamOf(pid), client.color, client.favColors);
          if (color !== client.color) {
            client.color = color;
            this.broadcast(message('playerInfo', { pid, color, loggedIn: client.identity.accountId !== null, ranked: false, admin: false, rank: 0, score: 0, negScore: 0, rankedPlayers: 0 }));
          }
          break;
        }
        case 'mapVote': {
          const vote = m.map >= 0 && m.map < this.rotation.length ? m.map : -1;
          if (vote === client.mapVote) break;
          client.mapVote = vote;
          if (vote === -1 && this.settings.server.requireSpecificMapVote && client.wantMapExit) this.noEffectWarning(pid);
          this.checkMapExit();
          break;
        }
        case 'mapExit':
          if (m.on === client.wantMapExit) break;
          client.wantMapExit = m.on;
          if (m.on && this.settings.server.requireSpecificMapVote && client.mapVote === -1) this.noEffectWarning(pid);
          this.checkMapExit();
          break;
        case 'negativeMapVotes':
          client.negativeVotes = new Set(m.maps.filter((i) => i < this.rotation.length));
          break;
        default:
          // opções: OG-046/047
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
      this.broadcast(message('startGame', {}), this.mapTimeMessage());
    }
    const running = this.gameOverUntil === null;
    if (running) {
      world.time = world.frame / 10; // relógio determinístico (D-09)
      this.sim.simulateFrame();
      for (const [pid, c] of this.clients) {
        const pl = world.players[pid] as PlayerState;
        const frags = pl.stats.frags;
        if (frags !== c.sentFrags) {
          c.sentFrags = frags;
          this.broadcast(message('frags', { pid, frags }));
        }
        this.updateHud(pid, c, pl);
      }
      world.teams.forEach((t, team) => {
        if (t.score === this.sentScores[team]) return;
        this.sentScores[team] = t.score;
        this.broadcast(message('scoreUpdate', { team: team === 0 ? 'red' : 'blue', score: t.score }));
      });
    }
    if (running) this.announceVotes();
    this.flush();
    const views = minimapViews(world, this.settings);
    for (const [pid, c] of this.clients) {
      const { frame, properties } = buildFrame(world, this.settings, views, pid, c.rs, { running, lastClientFrame: c.lastClientFrame, frameOffset: c.frameOffset, ping: null });
      const extra = properties.length ? [message('minimapProperties', { players: properties })] : [];
      this.send(pid, [...c.queue, message('frame', frame), ...extra]);
      c.queue = [];
    }
    this.frameSentTime = this.now();
    this.thinkAfterBroadcast();
    world.frame++;
  }

  /** Anúncio "x/y votos para trocar de mapa" e o fim do bloqueio de votação. */
  private announceVotes(): void {
    const s = this.settings.server;
    const info = announce(this.announcer, this.voters(), s.requireSpecificMapVote, this.world.frame, this.world.mapTime(), s.voteBlockTime);
    if (info) this.broadcast(message('mapChangeInfo', info));
    if (this.world.mapTime() === s.voteBlockTime) this.checkMapExit();
  }

  /** Arma e tempos de power-up do jogador, quando mudam (`data_weapon_change`, `data_pup_timer`). */
  private updateHud(pid: number, c: Client, pl: PlayerState): void {
    const time = this.world.time;
    if (pl.weapon !== c.hud.weapon) {
      c.hud.weapon = pl.weapon;
      this.queueTo(pid, message('weaponChange', { level: pl.weapon }));
    }
    const timers = [
      ['turbo', 'turboTime', pl.turbo, pl.turboTime],
      ['shadow', 'shadowTime', pl.hasShadow(), pl.shadowTime],
      ['power', 'powerTime', pl.power, pl.powerTime],
    ] as const;
    for (const [kind, key, active, end] of timers) {
      if (!active || end === c.hud[key]) continue;
      c.hud[key] = end;
      this.queueTo(pid, message('powerupTimer', { kind, seconds: Math.max(0, Math.round(end - time)) }));
    }
  }

  /** `send_map_time`: tempo de mapa e restante (prorrogação depois do tempo normal; 0 = sem limite). */
  private mapTimeMessage(): AnyMessage {
    const w = this.settings.world;
    const mapTime = this.world.mapTime();
    let left = 0;
    if (w.timeLimit > 0) {
      left = w.timeLimit - mapTime;
      if (left <= 0) left = Math.max(0, w.timeLimit + this.world.extraTimePeriod * w.extraTime - mapTime);
    }
    return message('mapTime', { elapsed: Math.trunc(mapTime / 10), left: Math.trunc(left / 10) });
  }

  /** Chat (RN-CHT-01): `.` = só o time; comandos `/` e moderação são do OG-046. */
  private chat(pid: number, text: string): void {
    const name = this.clients.get(pid)?.identity.name ?? '';
    const team = text.startsWith('.');
    const body = (team ? text.slice(1) : text).trim();
    if (!body || text.startsWith('/')) return;
    const msg = message('text', { kind: team ? 'team' : 'normal', from: pid, text: `${name}: ${body}` });
    if (!team) this.broadcast(msg);
    else for (const other of this.viewers((p) => p.team === this.world.teamOf(pid))) this.queueTo(other, msg);
  }

  /** Fim de partida no meio do frame (`server_next_map`): próximo mapa da rotação e placar. */
  private onGameOver(reason: GameOverReason, result: MatchResult): void {
    this.results.push(result);
    this.nextMap(reason);
  }

  /** Votantes (RN-VOT). */
  private voters(): Voter[] {
    return [...this.clients.values()].map((c) => ({ bot: c.bot, wantExit: c.wantMapExit, mapVote: c.mapVote, negative: c.negativeVotes }));
  }

  /** `check_map_exit`: atualiza os votos por mapa e troca de mapa se a maioria quer sair. */
  private checkMapExit(): void {
    this.sendVotes();
    if (this.gameOverUntil !== null) return; // já trocando
    const s = this.settings.server;
    if (shouldExit(this.voters(), s.requireSpecificMapVote, this.world.mapTime(), s.voteBlockTime)) this.nextMap('vote');
  }

  private sendVotes(): void {
    const votes = mapVotes(this.voters(), this.rotation.length);
    if (votes.length === this.sentVotes.length && votes.every((v, i) => v === this.sentVotes[i])) return;
    this.sentVotes = votes;
    this.broadcast(message('mapVotes', { votes }));
  }

  /** O texto é o mesmo do original, que o cliente reconhece (`want_map_exit_delayed`). */
  private noEffectWarning(pid: number): void {
    this.queueTo(pid, message('text', { kind: 'server', from: 255, text: 'Your vote has no effect until you vote for a specific map.' }));
  }

  private mapListMessage(): AnyMessage {
    const votes = mapVotes(this.voters(), this.rotation.length);
    return message('mapList', {
      revision: 0,
      maps: this.rotation.map((r, i) => ({ file: r.file, title: r.map.title, author: r.map.author, width: r.map.width, height: r.map.height, votes: votes[i] ?? 0 })),
    });
  }

  /** `server_next_map`: escolhe o próximo mapa (RN-VOT-03), zera os votos nele e mostra o placar. */
  private nextMap(reason: GameOverReason | 'vote'): void {
    const voters = this.voters();
    const votes = mapVotes(voters, this.rotation.length);
    const negative = (map: number) => voters.filter((v) => v.negative.has(map)).length;
    this.mapIndex = nextMap(this.rotation, votes, this.mapIndex, this.world.frame, negative, this.sim.rng);
    for (const c of this.clients.values()) {
      c.wantMapExit = false;
      if (c.mapVote === this.mapIndex) c.mapVote = -1;
    }
    const entry = this.rotation[this.mapIndex] as { map: GameMap; lastGame: number };
    entry.lastGame = this.world.frame;
    Object.assign(this.announcer, { votes: 0, needed: 0, nextFrame: 0 });
    const map = entry.map;
    this.sim.changeMap(map);
    this.balanceTeams();
    const delayFrames = Math.round(this.settings.server.gameEndDelay * 10);
    this.gameOverUntil = this.world.frame + delayFrames;
    // todos precisam carregar o novo mapa (`send_map_change_message`); bots não carregam
    this.world.players.forEach((p, pid) => {
      if (p && !this.clients.get(pid)?.bot) p.awaitingClientReadies++;
    });
    if (reason !== 'vote') this.broadcast(message('gameOver', { reason, seconds: this.settings.server.gameEndDelay }));
    this.broadcast(
      message('mapChange', { reason: reason === 'vote' ? 'vote' : reason === 'captureLimit' ? 'captureLimit' : 'timeOut', mapIndex: this.mapIndex, file: this.mapFile(this.mapIndex), title: map.title, crc: map.crc }),
      message('currentMap', { mapIndex: this.mapIndex }),
      message('worldReset', {}),
    );
    for (const team of [0, 1, 2]) this.dirtyFlags.add(team); // bandeiras do mapa novo
    this.sendVotes();
  }

  private mapFile(index: number): string {
    return (this.rotation[index] as { file: string }).file;
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
