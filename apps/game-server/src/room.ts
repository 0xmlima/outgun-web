// SPDX-License-Identifier: GPL-2.0-or-later
// Uma sala: mundo autoritativo (`ServerSim`), conexões e o ciclo da partida, como o `Server` do
// original (src/server.cpp) para um único mapa em rotação. Times, votação, chat e validação de
// entrada chegam nos cards OG-043..047; aqui ficam entrar, sair, aplicar entradas, simular a 10 Hz,
// mandar a cada jogador só o que ele vê (OG-042, aoi.ts), fim de partida e troca de mapa.
import { chatName, encodeFrame, message, PROTOCOL_VERSION, type AnyMessage, type MessageOf } from '@outgun/protocol';
import { presetSettings, PRESETS, type GameMode, type GameSettings, type Preset } from '@outgun/settings';
import { randomUUID } from 'node:crypto';
import { censor, formatDuration, isFlood, MAX_CHAT_LENGTH, TalkMeter } from './chat.js';
import { runCommand, type AuditEntry, type ConsoleHost, type ConsolePlayer } from './moderation.js';
import { matchReport, rankingMinimumsMet, type DeltaReport, type MatchReport, type ReportPlayer } from './match-report.js';
import { endOfGameMessages, statsKey, statsMessage, teamStatsKey, teamStatsMessage } from './stats-sync.js';
import { RankingDeltas, teamModifiers, type PlayerRating } from './ranking.js';
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
/** Conexão de quem caiu e ainda pode voltar (OG-047): nada é enviado. */
const OFFLINE: Connection = { send: () => {}, close: () => {} };

export interface Identity {
  name: string;
  /** Conta da API; null = convidado. */
  accountId: string | null;
  /** Clan tag da conta (RN-NOM-03), exibida como "(TAG) nome" no chat. */
  clanTag?: string | null;
  /** Administrador da plataforma (moderação, OG-046). */
  admin?: boolean;
  /** Dono da sala privada (OG-049): pode mudar as regras se o preset não for travado. */
  owner?: boolean;
  /** Ranking da conta na temporada e participação (OG-084); ausente = não participa, força 1,0. */
  rating?: PlayerRating;
  /** Endereço do jogador (ban por IP). */
  ip?: string;
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
  /** Auditoria das ações de admin (OG-046): o servidor manda para a API. */
  audit?: (roomId: string, entry: AuditEntry) => void;
  /** Palavras trocadas por `*` no chat (filtro opcional por sala). */
  chatFilter?: ReadonlySet<string>;
  /** Log do servidor (chat com `log_player_chat`). */
  log?: (line: string) => void;
  /** Quanto tempo a vaga de quem caiu fica guardada (s; padrão 15, 0 = sai na hora como o original). */
  reconnectSeconds?: number;
  /** Resultado de cada partida para a API (OG-049). */
  reportMatch?: (report: MatchReport) => void;
  /** Deltas do ranking fora do fim da partida: saída, troca de mapa por voto, reinício (OG-084). */
  reportDeltas?: (report: DeltaReport) => void;
  /** Relógio de parede (ms) para as datas da partida; padrão `Date.now`. */
  wallClock?: () => number;
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
  /** Contadores do último `stats` enviado deste jogador (OG-066). */
  sentStats: string;
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
  /** Chat e moderação (OG-046): id do /list, silêncio, anti-flood e contagem da expulsão (frames). */
  uid: number;
  muted: 0 | 1 | 2;
  talk: TalkMeter;
  kickTimer: number;
  /** Inatividade (RN-IDL-01): frames seguidos sem controles nem tiro (`idleFrames`). */
  idleFrames: number;
  /** Reconexão (OG-047): token para voltar e frame em que a conexão caiu (null = conectado). */
  resumeToken: string;
  /** Deltas do ranking ainda não enviados (OG-084). */
  deltas: RankingDeltas;
  disconnectedFrame: number | null;
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
  /** Ids do /list (`uniqueId`), bans da sala (chave → fim em ms) e linhas de /set aplicadas. */
  private nextUid = 1;
  private readonly bans = new Map<string, number>();
  private setLines: string[] = [];
  private uptimeFrames = 0;
  /** Início da partida atual (relógio de parede) e quantas partidas a sala já teve. */
  private matchStartedAt: number;
  private matchCount = 0;
  private deltaCount = 0;
  private readonly createdAt: number;
  private readonly console: ConsoleHost;
  private readonly preset: Preset;
  /** Placar já enviado (`scoreUpdate` só quando muda). */
  private readonly sentScores: [number, number] = [0, 0];
  /** Estatísticas de time já enviadas (`teamStats` só quando mudam, OG-066). */
  private readonly sentTeamStats: [string, string] = ['', ''];
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
    this.preset = preset;
    this.mode = preset.mode;
    this.settings = presetSettings(preset.id);

    this.now = options.now ?? (() => performance.now());
    this.createdAt = this.matchStartedAt = this.wallClock();
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
      scoreFrag: (pid, amount) => this.scoreFrag(pid, amount),
      scoreNeg: (pid, amount) => this.scoreNeg(pid, amount),
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
    this.console = this.makeConsole();
    this.sim.loadMapFlags();
    this.sim.startGame();
  }

  get presetId(): string {
    return this.preset.id;
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
    if (!opts.bot && this.isBanned(identity)) return { ok: false, reason: 'banned', text: 'Banido desta sala.' };
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
      sentStats: '',
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
      uid: this.nextUid++,
      muted: 0,
      talk: new TalkMeter(),
      kickTimer: 0,
      deltas: new RankingDeltas(),
      idleFrames: 0,
      resumeToken: randomUUID(),
      disconnectedFrame: null,
    });
    const pl = this.sim.addPlayer(pid);
    if (opts.bot) pl.awaitingClientReadies = 0; // bot não carrega mapa
    this.send(pid, [...this.welcomeMessages(pid), ...(opts.bot ? [] : [message('resumeToken', { token: this.clients.get(pid)!.resumeToken })])]);
    this.broadcast(message('playerJoined', { pid, name: identity.name, color, bot: opts.bot ?? false }));
    if (identity.rating) this.broadcast(this.playerInfo(pid, this.clients.get(pid)!));
    // segundo jogador: a partida recomeça (`client_connected` com player_count == 2)
    if (this.clients.size === 2) {
      this.sim.returnAllFlags();
      this.flushDeltas(); // `ctf_game_restart` envia os deltas de todos
      this.sim.resetWorld();
      this.world.mapStartFrame = this.world.frame;
      // o original agenda os power-ups depois do reinício (`check_powerup_creation(false)` no fim
      // de `client_connected`); o reset acima apagou os agendados por `addPlayer`
      this.sim.checkPowerupCreation(false);
      this.broadcast(message('worldReset', {}), message('startGame', {}), this.mapTimeMessage());
    }
    return { ok: true, pid };
  }

  private welcomeMessages(pid: number): AnyMessage[] {
    const out: AnyMessage[] = [
      message('welcome', { protocol: PROTOCOL_VERSION, pid, color: this.clients.get(pid)?.color ?? 0, maxPlayers: this.world.maxPlayers, mode: this.mode, mapIndex: this.mapIndex, redScore: this.world.teams[0].score, blueScore: this.world.teams[1].score }),
      this.serverSettingsMessage(),
      message('mapChange', { reason: 'other', mapIndex: this.mapIndex, file: this.mapFile(this.mapIndex), title: this.world.map.title, crc: this.world.map.crc }),
      message('playersPresent', { pids: [...this.clients.keys()] }),
      this.mapTimeMessage(),
      this.mapListMessage(),
      message('currentMap', { mapIndex: this.mapIndex }),
    ];
    for (const [other, c] of this.clients) {
      // o próprio jogador também recebe os frags (na volta de uma queda já pode ter alguns)
      if (other !== pid) out.push(message('playerJoined', { pid: other, name: c.identity.name, color: c.color, bot: c.bot }));
      out.push(message('frags', { pid: other, frags: (this.world.players[other] as PlayerState).stats.frags }));
      out.push(statsMessage(this.world.players[other] as PlayerState, this.world.time)); // `send_stats`
    }
    out.push(teamStatsMessage(0, this.world.teams[0]), teamStatsMessage(1, this.world.teams[1])); // `send_team_stats`
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

  /**
   * A conexão caiu (OG-047): a vaga, o time e as estatísticas ficam guardados por
   * `reconnectSeconds`; o jogador fica parado no mundo. Só vale para a conexão atual do jogador.
   */
  disconnect(pid: number, conn: Connection): void {
    const c = this.clients.get(pid);
    if (!c || c.conn !== conn) return;
    if (c.bot || this.reconnectFrames === 0 || c.kickTimer > 0) return this.leave(pid);
    c.conn = OFFLINE;
    c.disconnectedFrame = this.world.frame;
    const pl = this.world.players[pid] as PlayerState;
    pl.controls = 0;
    pl.attack = false;
  }

  /** Volta de quem caiu: pelo token de retomada ou pela mesma conta. null = não há vaga guardada. */
  resume(conn: Connection, identity: Identity, token: string): JoinResult | null {
    const found = [...this.clients].find(
      ([, c]) => !c.bot && c.kickTimer === 0 && ((token !== '' && c.resumeToken === token) || (c.disconnectedFrame !== null && identity.accountId !== null && c.identity.accountId === identity.accountId)),
    );
    if (!found) return null;
    const [pid, c] = found;
    if (c.conn !== OFFLINE) c.conn.close(4005, 'resumed'); // conexão antiga ainda não percebida como caída
    Object.assign(c, {
      conn,
      identity: { ...c.identity, ...(identity.ip ? { ip: identity.ip } : {}) },
      lastClientFrame: 0,
      frameOffset: 0,
      sentFrags: -1,
      sentStats: '',
      rs: new RecipientState(),
      queue: [],
      guard: new InputGuard(),
      hasInput: false,
      lastActivityFrame: this.world.frame,
      hud: { weapon: 0, turboTime: 0, shadowTime: 0, powerTime: 0 },
      idleFrames: 0,
      resumeToken: randomUUID(),
      disconnectedFrame: null,
    });
    (this.world.players[pid] as PlayerState).awaitingClientReadies++; // precisa carregar o mapa de novo
    this.send(pid, [...this.welcomeMessages(pid), message('resumeToken', { token: c.resumeToken })]);
    return { ok: true, pid };
  }

  private get reconnectFrames(): number {
    return Math.round((this.options.reconnectSeconds ?? 15) * 10);
  }

  /** Saída (`client_disconnected` → `removePlayer`); os deltas do ranking vão antes. */
  leave(pid: number): void {
    const c = this.clients.get(pid);
    if (!c) return;
    this.flushDeltas(pid);
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

  /** `refresh_team_score_modifiers` + `getLessScoredTeam`: modificador, placar, sorteio. */
  private lessScoredTeam(): 0 | 1 {
    const [m0, m1] = this.teamModifiers();
    if (m0 > m1) return 0;
    if (m1 > m0) return 1;
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
          if (m.text.length > MAX_CHAT_LENGTH || [...m.text].some((ch) => ch < ' ' || ch === '\x7f')) return this.kick(pid, 'chat inválido');
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
            this.broadcast(this.playerInfo(pid, client));
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
    this.uptimeFrames++;
    for (const c of this.clients.values()) c.guard.tick();
    if (this.gameOverUntil !== null && world.frame >= this.gameOverUntil) {
      this.gameOverUntil = null;
      this.sim.startGame();
      this.broadcast(message('startGame', {}), this.mapTimeMessage());
    }
    const running = this.gameOverUntil === null;
    if (running) {
      world.time = world.frame / 10; // relógio determinístico (D-09)
      for (const c of this.clients.values()) c.talk.cool(); // `simulatePlayerPrePhysics`
      this.sim.simulateFrame();
      for (const [pid, c] of this.clients) {
        const pl = world.players[pid] as PlayerState;
        const frags = pl.stats.frags;
        if (frags !== c.sentFrags) {
          c.sentFrags = frags;
          this.broadcast(message('frags', { pid, frags }));
        }
        const key = statsKey(pl);
        if (key !== c.sentStats) {
          c.sentStats = key;
          this.broadcast(statsMessage(pl, world.time));
        }
        this.updateHud(pid, c, pl);
      }
      ([0, 1] as const).forEach((team) => {
        const key = teamStatsKey(world.teams[team]);
        if (key === this.sentTeamStats[team]) return;
        this.sentTeamStats[team] = key;
        this.broadcast(teamStatsMessage(team, world.teams[team]));
      });
      world.teams.forEach((t, team) => {
        if (t.score === this.sentScores[team]) return;
        this.sentScores[team] = t.score;
        this.broadcast(message('scoreUpdate', { team: team === 0 ? 'red' : 'blue', score: t.score }));
      });
    }
    if (running) this.announceVotes();
    this.playerTimers(running);
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

  /** Chat (RN-CHT-01/02, `Server::chat`): `/` = comando, `.` = só o time, anti-flood e silêncio. */
  private chat(pid: number, raw: string): void {
    const c = this.clients.get(pid);
    if (!c || raw === '') return;
    const text = raw; // mais de MAX_CHAT_LENGTH já foi recusado como mensagem inválida (OG-043)
    if (text.startsWith('/')) return runCommand(this.console, pid, text);
    if (text.trim() === '') return; // só espaços
    if (c.talk.speak()) return this.queueTo(pid, message('tooMuchTalk', {}));
    if (c.muted === 1) return this.queueTo(pid, message('muted', {}));
    if (isFlood(text)) return;
    const team = text.startsWith('.');
    const body = censor((team ? text.slice(1) : text).trim(), this.options.chatFilter ?? new Set());
    const msg = message('text', { kind: team ? 'team' : 'normal', from: pid, text: `${chatName(c.identity.name, c.identity.clanTag)}: ${body}` });
    // smute: só o próprio jogador vê as mensagens dele
    if (c.muted === 2) return this.queueTo(pid, msg);
    if (!team) this.broadcast(msg);
    else for (const other of this.viewers((p) => p.team === this.world.teamOf(pid))) this.queueTo(other, msg);
    if (this.settings.server.logPlayerChat) this.options.log?.(`(chat) ${c.identity.name} [${c.identity.ip ?? '?'}]: ${text}`);
  }

  private isBanned(identity: Identity): boolean {
    const now = Date.now();
    const keys = [identity.accountId && `acct:${identity.accountId}`, identity.ip && `ip:${identity.ip}`].filter(Boolean) as string[];
    return keys.some((k) => (this.bans.get(k) ?? 0) > now);
  }

  /**
   * Por jogador, depois da simulação (src/server.cpp:1632-1661): contagem da expulsão por admin,
   * inatividade (RN-IDL-01) e, novo, o fim da espera de quem caiu (OG-047).
   */
  private playerTimers(running: boolean): void {
    const iktime = this.settings.server.idlekickTime; // frames
    const humans = [...this.clients.values()].filter((c) => !c.bot).length;
    for (const [pid, c] of [...this.clients]) {
      if (c.disconnectedFrame !== null) {
        if (this.world.frame - c.disconnectedFrame >= this.reconnectFrames) this.leave(pid);
        continue;
      }
      if (c.kickTimer) {
        c.kickTimer--;
        if (c.kickTimer === 0) this.drop(pid, 'kick', 4004, 'kicked');
        else if (c.kickTimer % 10 === 0 && c.kickTimer <= 50) this.queueTo(pid, message('disconnecting', { reason: 'kick', seconds: c.kickTimer / 10 }));
        continue;
      }
      const pl = this.world.players[pid] as PlayerState;
      if (!running || pl.dead || c.bot) continue;
      const idle = !pl.attack && !pl.attackOnce && (pl.controls & 31) === 0;
      if (iktime !== 0 && idle && humans >= this.settings.server.idlekickPlayerlimit) {
        c.idleFrames++;
        const timeToKick = iktime - c.idleFrames;
        if (timeToKick === 0) this.drop(pid, 'idleKick', 4006, 'idle');
        else if (
          (timeToKick === 600 && iktime >= 1800) ||
          (timeToKick === 300 && iktime >= 900) ||
          (timeToKick === 150 && iktime >= 300) ||
          (timeToKick === 50 && iktime >= 100)
        ) {
          this.queueTo(pid, message('idleKickWarning', { seconds: timeToKick / 10 }));
        }
      } else c.idleFrames = 0;
    }
  }

  /** Desconecta pelo servidor (`disconnectPlayer`): avisa, fecha e libera a vaga na hora. */
  private drop(pid: number, reason: 'kick' | 'idleKick', code: number, text: string): void {
    const c = this.clients.get(pid);
    if (!c) return;
    // o que estava na fila sai antes do aviso de desconexão
    c.conn.send(encodeFrame(...c.queue, message('disconnecting', { reason, seconds: 0 })));
    c.queue = [];
    c.conn.close(code, text);
    this.leave(pid);
  }

  private consolePlayer(pid: number, c: Client): ConsolePlayer {
    return {
      pid,
      uid: c.uid,
      name: c.identity.name,
      team: this.world.teamOf(pid),
      account: c.identity.accountId,
      admin: c.identity.admin ?? false,
      ...(c.identity.owner ? { owner: true } : {}),
      muted: c.muted,
      bot: c.bot,
      ranked: this.mode === 'ranked' && c.identity.accountId !== null,
      ...(c.identity.ip ? { ip: c.identity.ip } : {}),
    };
  }

  private serverSettingsMessage(): AnyMessage {
    const gamemod = [this.preset.overrides, ...this.setLines].filter(Boolean).join('\n');
    return message('serverSettings', { preset: this.preset.id, gamemod, locked: this.preset.locked });
  }

  /** `/time` (`ServerWorld::printTimeStatus`). */
  private timeStatus(): string[] {
    const w = this.settings.world;
    const mapTime = this.world.mapTime();
    let map = `Map time: ${formatDuration(Math.trunc(mapTime / 10))}.`;
    if (w.timeLimit === 0) map += ' There is no time limit.';
    else {
      const remaining = Math.trunc((w.timeLimit - mapTime) / 10);
      if (this.world.players.filter(Boolean).length === 1) map += ' No time limit at the moment as there is only one player.';
      else if (remaining < 0) {
        const extra = Math.trunc((w.timeLimit + this.world.extraTimePeriod * w.extraTime - mapTime) / 10);
        if (extra > 0) map += ` Extra-time left: ${formatDuration(extra)}.`;
        if (w.suddenDeath) map += ' Sudden death.';
      } else map += ` Time left: ${formatDuration(remaining)}.`;
    }
    return [`The server has been up for ${formatDuration(Math.trunc(this.uptimeFrames / 10))}.`, map];
  }

  private makeConsole(): ConsoleHost {
    return {
      settings: this.settings,
      locked: this.preset.locked,
      players: () => [...this.clients].map(([pid, c]) => this.consolePlayer(pid, c)),
      reply: (pid, kind, text) => this.queueTo(pid, message('text', { kind, from: 255, text })),
      broadcastText: (kind, text) => this.broadcast(message('text', { kind, from: 255, text })),
      setMuted: (target, mode, admin, tellTarget) => {
        const c = this.clients.get(target);
        if (!c) return;
        const msg = message('playerMute', { pid: target, mode, admin: admin.name });
        for (const pid of this.clients.keys()) if (tellTarget || pid !== target) this.queueTo(pid, msg);
        c.muted = mode;
      },
      kick: (target, admin, minutes, reason) => {
        const c = this.clients.get(target);
        if (!c || c.kickTimer !== 0) return false;
        if (minutes > 0) {
          const until = Date.now() + minutes * 60_000;
          if (c.identity.accountId) this.bans.set(`acct:${c.identity.accountId}`, until);
          if (c.identity.ip) this.bans.set(`ip:${c.identity.ip}`, until);
        }
        this.broadcast(message('playerKick', { pid: target, minutes, admin: admin.name }));
        if (reason) this.queueTo(target, message('text', { kind: 'warning', from: 255, text: `Reason: ${reason}` }));
        c.kickTimer = 10 * 10;
        return true;
      },
      forceMap: (admin) => {
        const vote = this.clients.get(admin.pid)?.mapVote ?? -1;
        const change = vote !== -1 && vote !== this.mapIndex;
        this.nextMap('vote', change ? vote : this.mapIndex);
        return change;
      },
      timeStatus: () => this.timeStatus(),
      settingsChanged: (line) => {
        this.setLines.push(line);
        this.broadcast(this.serverSettingsMessage(), this.mapTimeMessage());
      },
      resetSettings: () => {
        const fresh = presetSettings(this.preset.id);
        for (const group of ['world', 'powerups', 'physics', 'server'] as const) Object.assign(this.settings[group], fresh[group]);
        this.setLines = [];
        this.broadcast(this.serverSettingsMessage(), this.mapTimeMessage());
      },
      audit: (entry) => this.options.audit?.(this.id, entry),
    };
  }

  /** Fim de partida no meio do frame (`server_next_map`): próximo mapa da rotação e placar. */
  private onGameOver(reason: GameOverReason, result: MatchResult): void {
    this.results.push(result);
    this.report(result);
    // `server_next_map`: movimento e tiros de todos e `stats_ready` antes do placar
    this.broadcast(...endOfGameMessages([...this.clients.keys()].map((pid) => this.world.players[pid] as PlayerState), [this.world.teams[0], this.world.teams[1]]));
    this.nextMap(reason);
  }

  private wallClock(): number {
    return this.options.wallClock?.() ?? Date.now();
  }

  /** Quem está no slot (para o resultado e os mínimos do ranking). */
  private reportPlayer(pid: number): ReportPlayer | undefined {
    const c = this.clients.get(pid);
    return c ? { name: c.identity.name, accountId: c.identity.accountId, bot: c.bot } : undefined;
  }

  /** Mínimos do ranking cumpridos agora (`rankingEnabled`), só em sala Ranked (RN-MOD-05). */
  rankingEnabled(): boolean {
    if (this.mode !== 'ranked') return false;
    const players = [...this.clients.keys()].map((pid) => this.reportPlayer(pid)!);
    return rankingMinimumsMet(players, this.settings.server.rankingMinhumans, this.settings.server.rankingMinplayers);
  }

  /** Modificadores dos times com o ranking de quem está na sala (bots e convidados valem 1,0). */
  teamModifiers(): [number, number] {
    const players = [...this.clients].map(([pid, c]) => ({ team: this.world.teamOf(pid) as 0 | 1, score: c.identity.rating?.score ?? 0, neg: c.identity.rating?.neg ?? 0 }));
    return teamModifiers(players, this.settings.world.respawnBalancingTime >= 5);
  }

  /** `broadcast_player_crap`: cor, conta e ranking do jogador. */
  private playerInfo(pid: number, c: Client): AnyMessage {
    const r = c.identity.rating;
    return message('playerInfo', {
      pid,
      color: c.color,
      loggedIn: c.identity.accountId !== null,
      ranked: this.mode === 'ranked' && this.participates(c),
      admin: c.identity.admin ?? false,
      rank: r?.rank ?? 0,
      score: Math.trunc(r?.score ?? 0),
      negScore: r?.neg ?? 0,
      rankedPlayers: r?.of ?? 0,
    });
  }

  private participates(c: Client | undefined): c is Client {
    return c !== undefined && !c.bot && c.identity.accountId !== null && c.identity.rating?.participate === true;
  }

  /** `Server::score_frag` (a sim já somou o frag): delta × modificador do time. */
  private scoreFrag(pid: number, amount: number): void {
    const c = this.clients.get(pid);
    if (!this.participates(c) || !this.rankingEnabled()) return;
    c.deltas.addFrag(amount, this.teamModifiers()[this.world.teamOf(pid)] as number);
  }

  /** `Server::score_neg`: sem modificador. */
  private scoreNeg(pid: number, amount: number): void {
    const c = this.clients.get(pid);
    if (!this.participates(c) || !this.rankingEnabled()) return;
    c.deltas.addNeg(amount);
  }

  /** `client_report_status` de um jogador (ou de todos): só deltas inteiros diferentes de zero. */
  flushDeltas(only?: number): void {
    for (const [pid, c] of this.clients) {
      if (only !== undefined && pid !== only) continue;
      if (!this.participates(c)) continue;
      const d = c.deltas.take();
      if (!d) continue;
      this.options.reportDeltas?.({
        deltaId: `${this.id}-${this.createdAt.toString(36)}-d${++this.deltaCount}`,
        roomId: this.id,
        userId: c.identity.accountId!,
        scoreDelta: d.score,
        negDelta: d.neg,
      });
    }
  }

  /** Manda o resultado à API: estatísticas sempre; ranqueada só no Ranked com os mínimos. */
  private report(result: MatchResult): void {
    const endedAt = this.wallClock();
    const startedAt = this.matchStartedAt;
    this.matchCount++;
    // os deltas vão junto do resultado (e saem dos acumuladores mesmo sem API, como no original)
    const deltas = new Map<number, { score: number; neg: number }>();
    for (const [pid, c] of this.clients) {
      const d = this.participates(c) ? c.deltas.take() : undefined;
      if (d) deltas.set(pid, d);
    }
    if (!this.options.reportMatch || ![...this.clients.values()].some((c) => !c.bot)) return;
    this.options.reportMatch(
      matchReport({
        serverMatchId: `${this.id}-${this.createdAt.toString(36)}-${this.matchCount}`,
        roomId: this.id,
        mode: this.mode,
        ranked: this.mode === 'ranked' && (this.rankingEnabled() || deltas.size > 0),
        deltas: (pid) => deltas.get(pid) ?? { score: 0, neg: 0 },
        rules: (({ captureLimit, winScoreDifference, timeLimit, extraTime, extraTimePeriods, suddenDeath }) => ({ captureLimit, winScoreDifference, timeLimit, extraTime, extraTimePeriods, suddenDeath }))(this.settings.world),
        map: this.mapFile(this.mapIndex),
        result,
        startedAt,
        endedAt,
        who: (pid) => this.reportPlayer(pid),
      }),
    );
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
  private nextMap(reason: GameOverReason | 'vote', forced?: number): void {
    this.flushDeltas(); // `ctf_game_restart`; no fim de partida já foram com o resultado
    const voters = this.voters();
    const votes = mapVotes(voters, this.rotation.length);
    const negative = (map: number) => voters.filter((v) => v.negative.has(map)).length;
    // /forcemap: o mapa escolhido ganha 99 votos no original, o que o torna o próximo
    this.mapIndex = forced ?? nextMap(this.rotation, votes, this.mapIndex, this.world.frame, negative, this.sim.rng);
    for (const c of this.clients.values()) {
      c.wantMapExit = false;
      if (c.mapVote === this.mapIndex) c.mapVote = -1;
    }
    const entry = this.rotation[this.mapIndex] as { map: GameMap; lastGame: number };
    entry.lastGame = this.world.frame;
    this.matchStartedAt = this.wallClock();
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
