// SPDX-License-Identifier: GPL-2.0-or-later
// Uma sala: mundo autoritativo (`ServerSim`), conexões e o ciclo da partida, como o `Server` do
// original (src/server.cpp) para um único mapa em rotação. Times, votação, chat e validação de
// entrada chegam nos cards OG-043..047; aqui ficam entrar, sair, aplicar entradas, simular a 10 Hz,
// mandar a cada jogador só o que ele vê (OG-042, aoi.ts), fim de partida e troca de mapa.
import { chatName, encodeFrame, message, PROTOCOL_VERSION, type AnyMessage, type MessageOf } from '@outgun/protocol';
import { applyGamemod, formatPlayers, newSeries, recordSeriesGame, seriesOver, seriesWinner, settingsOf, type GameMode, type GameSettings, type Preset, type RankedRoomFormat, type SeriesScore } from '@outgun/settings';
import { findPreset } from './presets.js';
import type { GeneratedMaps, RandomMapParams } from './generated-maps.js';
import { randomUUID } from 'node:crypto';
import { censor, formatDuration, isFlood, MAX_CHAT_LENGTH, TalkMeter } from './chat.js';
import { ReportLimiter, runCommand, type AuditEntry, type BotConsole, type ConsoleHost, type ConsolePlayer, type PlayerReport } from './moderation.js';
import { BotClient, type BotHost } from './bot-client.js';
import { BOT_LEVELS, botSkill, type BotSkill } from '@outgun/bots';
import { createBotName, neededBots } from './bots.js';
import { ReplayRecorder } from './replay.js';
import { SpectatorStream } from './spectators.js';
import { RankedLobby } from './ranked-lobby.js';
import { PAUSE_REQUESTS, RANKED_RECONNECT_FRAMES, RankedPause, type PauseRefusal } from './pause.js';
/** Bots substitutos por partida Ranked, somando os dois times (RN-RKL-19). */
const MAX_SUBSTITUTES = 2;
import { matchReport, rankingMinimumsMet, type DeltaReport, type MatchReport, type ReportPlayer, type Substitution } from './match-report.js';
import { endOfGameMessages, statsKey, statsMessage, teamStatsKey, teamStatsMessage } from './stats-sync.js';
import { RankingDeltas, teamModifiers, type PlayerRating } from './ranking.js';
import { buildFrame, minimapViews, RecipientState, seesRocket } from './aoi.js';
import { InputGuard, isNewerOrSame } from './input-guard.js';
import { announce, initialRotation, mapVotes, nextMap, shouldExit, type VoteAnnouncer, type Voter } from './map-vote.js';
import { balanceMoves, botToRebalance, botToRemove, ColorPool, freeSlot, joinTeam, lobbyJoinTeam, NO_COLOR, shuffleSwaps, teamChangeFor, type Slot } from './teams.js';
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
  /** Ping medido pelo transporte (ms), se já houver medida. */
  rtt?(): number | undefined;
}

/** Conexão de quem caiu e ainda pode voltar (OG-047): nada é enviado. */
const OFFLINE: Connection = { send: () => {}, close: () => {} };

export interface Identity {
  name: string;
  /** Conta da API; null = convidado. */
  accountId: string | null;
  /** Clan tag da conta (RN-NOM-03), exibida como "(TAG) nome" no chat. */
  clanTag?: string | null;
  /** Id do clã cadastrado (OG-253): mesmo clã entra do mesmo lado no lobby Ranked. */
  clanId?: string | null;
  /** Administrador da plataforma (moderação, OG-046). */
  admin?: boolean;
  /** Dono da sala privada (OG-049): pode mudar as regras se o preset não for travado. */
  owner?: boolean;
  /** Ranking da conta na temporada e participação (OG-084); ausente = não participa, força 1,0. */
  rating?: PlayerRating;
  /** Endereço do jogador (ban por IP). */
  ip?: string;
  /** Nível do bot substituto desta conta (OG-266, do ticket Ranked); ausente = intermediário. */
  botLevel?: number;
  /** Hash do dispositivo, vindo do ticket (ban por dispositivo, OG-104). */
  device?: string;
}

/** Comando do painel admin para esta sala (resposta do heartbeat, OG-087). */
export interface RemoteCommand {
  id: number;
  kind: 'kick' | 'ban' | 'mute' | 'unmute' | 'message';
  uid?: number;
  minutes?: number;
  reason?: string;
  text?: string;
  actor: string;
}

export interface RemoteResult {
  ok: boolean;
  text?: string;
  target?: { name: string; accountId?: string; ip?: string; device?: string };
}

/** Entrada da rotação; `random` = `random_map` (o mapa e o arquivo mudam a cada vez que entra). */
interface RotationEntry {
  map: GameMap;
  file: string;
  lastGame: number;
  random?: RandomMapParams;
}

/** Bots da sala Casual configurados pelo cliente (OG-289, D-51): quantidade fixa e nível (0 = variável). */
export interface CasualBots {
  bots: number;
  level: number;
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
  /**
   * Entradas `random_map` da rotação (OG-015), alinhadas com `maps`: a sala gera um mapa novo cada
   * vez que a entrada entra (o de `maps` é o primeiro gerado). Precisa de `generatedMaps`.
   */
  randomSlots?: readonly (RandomMapParams | null)[] | undefined;
  generatedMaps?: GeneratedMaps | undefined;
  /** Relógio em ms para medir quando os inputs chegam dentro do frame (padrão `performance.now`). */
  now?: () => number;
  /** Auditoria das ações de admin (OG-046): o servidor manda para a API. */
  audit?: (roomId: string, entry: AuditEntry) => void;
  /** Palavras trocadas por `*` no chat (filtro opcional por sala). */
  chatFilter?: ReadonlySet<string>;
  /** Log do servidor (chat com `log_player_chat`). */
  log?: (line: string) => void;
  /** Denúncia de jogador pelo `/report` (OG-104), para a fila da moderação na API. */
  reportPlayer?: (report: PlayerReport) => void;
  /** Jogador expulso por mensagem inválida ou excesso (métricas e log, OG-102). */
  onMisbehavior?: (kick: { name: string; ip: string | undefined; reason: string }) => void;
  /** Quanto tempo a vaga de quem caiu fica guardada (s; padrão 15, 0 = sai na hora como o original). */
  reconnectSeconds?: number;
  /** Resultado de cada partida para a API (OG-049). */
  reportMatch?: (report: MatchReport) => void;
  /** Deltas do ranking fora do fim da partida: saída, troca de mapa por voto, reinício (OG-084). */
  reportDeltas?: (report: DeltaReport) => void;
  /** Relógio de parede (ms) para as datas da partida; padrão `Date.now`. */
  wallClock?: () => number;
  /** Onde gravar os replays (OG-090); ausente = sem gravação. Devolve a URL pública. */
  replays?: { save(key: string, data: Uint8Array): string };
  /** `bots_fill` das salas Casual (OG-054; o preset Clássico tem 0). Ignorado no Ranked (D-11). */
  botsFill?: number;
  /** Bots escolhidos pelo dono ao criar a sala privada Casual (OG-289); por cima do `botsFill`. */
  casualBots?: CasualBots;
  /** Teste de bots (`-bottest` do original): bots jogam sem humanos (testes e medições; nunca em produção). */
  botTest?: boolean;
  /** Linhas de gamemod por cima do preset desde a criação (como um /set inicial). */
  gamemod?: string;
  /** Espectadores ao vivo por sala (OG-092; padrão 16). */
  maxSpectators?: number;
  /** Formato e série da sala Ranked (OG-250); `maxPlayers` tem de ser 2 × N. */
  ranked?: RankedRoomFormat;
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
  /** Kills em bots na partida atual (marcos do OG-213 não contam bots). */
  botKills: number;
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
  /** Saiu de vez de um jogo Ranked e o time está votando o bot substituto (OG-262). */
  departing?: boolean;
  /** Bot substituto (OG-262): quem ele substitui, para devolver a vaga se a pessoa voltar. */
  replaced?: { identity: Identity; resumeToken: string };
}

const FLAG_TYPE = { [CarriedFlag.None]: 'none', [CarriedFlag.Own]: 'own', [CarriedFlag.Enemy]: 'enemy', [CarriedFlag.Wild]: 'wild' } as const;
const CAUSE = { [DamageType.rocket]: 'rocket', [DamageType.deathbringer]: 'deathbringer', [DamageType.collision]: 'collision' } as const;
const FLAG_TEAM = ['red', 'blue', 'wild'] as const;
/** Avisos da pausa do Ranked (OG-260). */
const PAUSE_TEXT: Record<PauseRefusal | 'unavailable', string> = {
  unavailable: 'Pausa só no Ranked, com o jogo em andamento.',
  busy: 'O jogo já está pausado.',
  noBalance: 'Seu time não tem mais saldo de pausa neste jogo.',
  noRequests: 'Seu time já usou os 3 pedidos de pausa deste jogo.',
  notPaused: 'O jogo não está pausado.',
  notYours: 'Só o time que pediu a pausa pode retomar.',
};
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
  private readonly rotation: RotationEntry[];
  private mapIndex = 0;
  /** Votos por mapa já enviados (`mapVotes` só quando mudam). */
  private sentVotes: number[] = [];
  private readonly announcer: VoteAnnouncer = { votes: 0, needed: 0, nextFrame: 0 };
  /** Placar de fim de partida: até este frame o mundo não é simulado. */
  private gameOverUntil: number | null = null;
  /** Servidor desligando (OG-103): a sala fecha no fim da partida em andamento. */
  private draining = false;
  /** Partida acabou durante a drenagem (ou não há humanos): o gerenciador fecha a sala. */
  finished = false;
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
  /** Lobby das salas Ranked com formato (OG-252): fora do jogo o mundo fica parado. */
  readonly lobby: RankedLobby | undefined;
  private lobbyDirty = false;
  /** Pausa do jogo Ranked (OG-260): com ela ativa o mundo não anda (nem `world.frame`). */
  readonly pause: RankedPause | undefined;
  /** Último `pauseState` enviado (só manda quando muda). */
  private sentPause = '';
  /** Bots substitutos que já entraram neste jogo (OG-262). */
  private substitutes = 0;
  /** Desconexões permanentes deste jogo, para o relatório (OG-263). */
  private substitutions: Substitution[] = [];
  /** Pedidos de troca de lado no lobby (OG-253): quem pediu → com quem. */
  private readonly swapRequests = new Map<number, number>();
  /** Série em andamento (OG-250): numerada por sala; ao acabar, o jogo seguinte abre a próxima. */
  private series: { no: number; score: SeriesScore } | undefined;
  private deltaCount = 0;
  private readonly createdAt: number;
  private readonly console: ConsoleHost;
  /** Limite do `/report` por jogador (OG-104). */
  private readonly reports = new ReportLimiter();
  private readonly preset: Preset;
  /** Placar já enviado (`scoreUpdate` só quando muda). */
  private readonly sentScores: [number, number] = [0, 0];
  /** Estatísticas de time já enviadas (`teamStats` só quando mudam, OG-066). */
  private readonly sentTeamStats: [string, string] = ['', ''];
  /** Times cujas bandeiras mudaram no frame (um `flagUpdate` por time, antes do frame). */
  private readonly dirtyFlags = new Set<number>();
  /** Replay da partida em curso (OG-090). */
  private recorder: ReplayRecorder | null = null;
  /** `check_bots`: recalcular a população de bots no próximo frame. */
  private checkBotsPending = true;
  /** `extra_bots` (/bot add e /bot remove). */
  private extraBots = 0;
  /** `reservedBotNames`: nomes já gerados nesta sala. */
  private readonly reservedBotNames = new Set<string>();
  /** Nomes de bots com sorteio próprio, para não mexer na sequência do mundo. */
  private readonly botNameRng: GlibcRand;
  /** Quando o último frame foi enviado (`frameSentTime`), em ms. */
  private frameSentTime = 0;
  /** Último pid cujo ping foi enviado (rodízio). */
  private pingCursor = -1;
  /** Sorteio dos bots (no original, o `rand()` global; aqui separado para não mexer na sequência do mundo). */
  private readonly botRng: GlibcRand;
  /** Sorteio do nível de cada bot no modo variável (OG-289), separado para não mexer nos outros. */
  private readonly botLevelRng: GlibcRand;
  /** Bots pedidos pelo dono para a próxima partida (OG-289). */
  private pendingCasualBots: CasualBots | null = null;
  /** Regras de bandeira já anunciadas (`flagModeMask`). */
  private sentFlagModes = '';
  /** Espectadores ao vivo com atraso (OG-092). */
  private readonly spectators: SpectatorStream;

  constructor(private readonly options: RoomOptions) {
    const preset = findPreset(options.preset);
    if (!preset) throw new Error(`preset desconhecido: ${options.preset}`);
    if (options.maps.length === 0) throw new Error('rotação de mapas vazia');
    if (options.maxPlayers % 2 !== 0 || options.maxPlayers < 2 || options.maxPlayers > 32) throw new Error(`max_players inválido: ${options.maxPlayers}`);
    this.id = options.id;
    this.preset = preset;
    this.mode = preset.mode;
    if (options.ranked) {
      if (this.mode !== 'ranked') throw new Error('formato e série só em sala Ranked');
      if (options.maxPlayers !== formatPlayers(options.ranked.format)) throw new Error(`sala ${options.ranked.format} precisa de ${formatPlayers(options.ranked.format)} vagas`);
      this.series = { no: 1, score: newSeries(options.ranked.bestOf) };
    }
    this.settings = options.gamemod ? applyGamemod(settingsOf(preset), options.gamemod).settings : settingsOf(preset);
    if (options.gamemod) this.setLines = [options.gamemod];

    this.now = options.now ?? (() => performance.now());
    this.createdAt = this.matchStartedAt = this.wallClock();
    const rng = new GlibcRand(options.seed);
    this.botNameRng = new GlibcRand(options.seed + 1);
    this.botRng = new GlibcRand(options.seed + 2);
    this.botLevelRng = new GlibcRand(options.seed + 3);
    this.spectators = new SpectatorStream(options.maxSpectators ?? 16);
    if (this.mode === 'casual' && options.botsFill !== undefined) this.settings.server.botsFill = options.botsFill;
    if (this.mode === 'casual' && options.casualBots) this.applyCasualBots(options.casualBots);
    // `random_maprot`: em ordem, embaralhada ou com o primeiro sorteado (RN-VOT-04)
    const { order, first } = initialRotation(options.maps.length, this.settings.server.randomMaprot, rng);
    this.rotation = order.map((i) => ({
      map: options.maps[i] as GameMap,
      file: options.mapFiles?.[i] ?? (options.maps[i] as GameMap).title,
      lastGame: 0,
      ...(options.randomSlots?.[i] ? { random: options.randomSlots[i] } : {}),
    }));
    this.mapIndex = first;
    if (options.ranked) {
      const lobbyRng = new GlibcRand(options.seed + 3);
      this.lobby = new RankedLobby(options.maxPlayers, this.rotation.length, (n) => lobbyRng.rand() % n);
    }
    if (this.mode === 'ranked') this.pause = new RankedPause();
    this.world = new WorldState((this.rotation[first] as { map: GameMap }).map, options.maxPlayers);
    this.sim = new ServerSim(this.world, this.settings, rng, {
      kill: (attacker, target, cause, carried, carrierDefended, flagDefended) => {
        const killer = this.clients.get(attacker & 31);
        if (killer && (attacker & 31) !== target && this.clients.get(target)?.bot) killer.botKills++;
        this.broadcast(message('kill', { attacker: attacker & 31, target, cause: CAUSE[cause], carriedFlag: FLAG_TYPE[carried], carrierDefended, flagDefended }));
      },
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
        this.recorder?.event(msg);
      },
      rocketRemoved: (rid, x, y, target) => {
        const msg = message('rocketDelete', { rocket: rid, target: target < 0 ? 255 : target, x, y });
        for (const pid of this.rocketViewers[rid] ?? []) this.queueTo(pid, msg);
        this.recorder?.event(msg);
        this.rocketViewers[rid] = new Set();
      },
      powerupAppeared: (index) => {
        const it = this.world.items[index]!;
        for (const pid of this.viewers((p) => p.pos.sameRoom(it.pos))) this.queueTo(pid, this.powerupVisible(index));
        this.recorder?.event(this.powerupVisible(index));
      },
      powerupPicked: (index, pos) => {
        for (const pid of this.viewers((p) => p.pos.sameRoom(pos))) this.queueTo(pid, message('powerupPicked', { id: index }));
        this.recorder?.event(message('powerupPicked', { id: index }));
      },
      deathbringerExploded: (team, pos, frame) =>
        this.broadcast(message('deathbringer', { team: team === 0 ? 'red' : 'blue', frame, roomX: pos.roomX, roomY: pos.roomY, x: Math.trunc(pos.x), y: Math.trunc(pos.y) })),
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
    this.startRecording();
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
    // lobby Ranked (OG-252, D-43): em jogo ou com a série acabada ninguém entra; entre jogos, se houver vaga
    if (this.lobby && !this.lobby.acceptsJoins) {
      return this.lobby.members.size >= this.lobby.capacity ? { ok: false, reason: 'serverFull', text: 'Sala cheia.' } : { ok: false, reason: 'roomClosed', text: 'Partida em andamento.' };
    }
    if (this.clients.size >= this.world.maxPlayers) {
      const bot = opts.bot ? -1 : botToRemove(this.slots(), this.world.maxPlayers);
      if (bot === -1) return { ok: false, reason: 'serverFull', text: 'Sala cheia.' };
      this.dropBot(bot);
    }
    const team = this.lobby
      ? lobbyJoinTeam(this.slots(), this.world.maxPlayers, (p) => this.clients.get(p)?.identity.clanId, identity.clanId, () => this.lessScoredTeam())
      : joinTeam(this.slots(), this.world.maxPlayers, () => this.lessScoredTeam());
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
      botKills: 0,
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
    this.checkBotsPending = true;
    if (opts.bot) pl.awaitingClientReadies = 0; // bot não carrega mapa
    this.send(pid, [...this.welcomeMessages(pid), ...(opts.bot ? [] : [message('resumeToken', { token: this.clients.get(pid)!.resumeToken })])]);
    this.broadcast(message('playerJoined', { pid, name: identity.name, color, bot: opts.bot ?? false }));
    // clã no HUD (OG-206, RN-NOM-04): convidados e bots não têm tag
    if (identity.clanTag) this.broadcast(message('playerClan', { pid, tag: identity.clanTag }));
    if (identity.rating) this.broadcast(this.playerInfo(pid, this.clients.get(pid)!));
    this.sendCasualConfig(pid);
    if (this.lobby) {
      this.lobby.join(pid, this.world.frame);
      this.lobbyDirty = true;
      return { ok: true, pid };
    }
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
      this.startRecording();
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
      if (other !== pid && c.identity.clanTag) out.push(message('playerClan', { pid: other, tag: c.identity.clanTag }));
      // conta e ranking de quem já estava: o sublinhado de conta também para quem chega depois (OG-277)
      if (c.identity.rating) out.push(this.playerInfo(other, c));
      out.push(message('frags', { pid: other, frags: (this.world.players[other] as PlayerState).stats.frags }));
      out.push(statsMessage(this.world.players[other] as PlayerState, this.world.time)); // `send_stats`
    }
    out.push(teamStatsMessage(0, this.world.teams[0]), teamStatsMessage(1, this.world.teams[1])); // `send_team_stats`
    for (const team of [0, 1, 2]) out.push(this.flagUpdate(team));
    out.push(message('flagModes', this.sim.flagModes())); // `send_flag_modes` na entrada
    if (this.pause) out.push(this.pauseStateMessage()); // quem entra ou volta vê a pausa e o saldo (OG-264)
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
  disconnect(pid: number, conn: Connection, voluntary = false): void {
    const c = this.clients.get(pid);
    if (!c || c.conn !== conn) return;
    if (c.bot || this.reconnectFrames === 0 || c.kickTimer > 0) return this.leave(pid);
    // no lobby Ranked a vaga não fica guardada: quem cai fora do jogo libera a vaga (OG-252)
    if (this.lobby && !this.lobby.playing) return this.leave(pid);
    // jogo Ranked: "Sair" é desconexão permanente na hora; a queda pausa o jogo (OG-261, RN-RKL-17/18)
    const rankedGame = this.pause !== undefined && this.inGame;
    c.conn = OFFLINE;
    c.disconnectedFrame = this.uptimeFrames; // relógio da sala: anda também com o jogo pausado
    if (rankedGame) {
      this.releaseKeys();
      // "Sair" sem bot disponível vira um a menos na hora e o jogador já sai da sala aqui
      if (voluntary) return this.depart(pid);
      this.pause!.drop(pid, this.world.teamOf(pid) as 0 | 1, this.uptimeFrames + this.reconnectFrames);
    }
    const pl = this.world.players[pid] as PlayerState;
    pl.controls = 0;
    pl.attack = false;
  }

  /** Volta de quem caiu: pelo token de retomada ou pela mesma conta. null = não há vaga guardada. */
  resume(conn: Connection, identity: Identity, token: string): JoinResult | null {
    const found = [...this.clients].find(
      ([, c]) =>
        (!c.bot && c.kickTimer === 0 && ((token !== '' && c.resumeToken === token) || (c.disconnectedFrame !== null && identity.accountId !== null && c.identity.accountId === identity.accountId))) ||
        // vaga ocupada pelo bot substituto: quem foi substituído volta e o bot sai (OG-262)
        (c.replaced !== undefined && ((token !== '' && c.replaced.resumeToken === token) || (identity.accountId !== null && c.replaced.identity.accountId === identity.accountId))),
    );
    if (!found) return null;
    const [pid, c] = found;
    if (c.replaced) {
      c.conn.close(1000, 'replaced');
      Object.assign(c, { identity: c.replaced.identity, bot: false, replaced: undefined, deltas: new RankingDeltas() });
      this.broadcast(message('playerName', { pid, name: c.identity.name }));
      this.pause?.brief(this.world.teamOf(pid) as 0 | 1, pid, this.uptimeFrames); // volta com a contagem de 3 s
    } else if (c.conn !== OFFLINE) c.conn.close(4005, 'resumed'); // conexão antiga ainda não percebida como caída
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
      departing: false,
    });
    (this.world.players[pid] as PlayerState).awaitingClientReadies++; // precisa carregar o mapa de novo
    this.pause?.undrop(pid, this.uptimeFrames); // voltou: sem mais ninguém caído, retomada em 3 s (OG-261)
    // a página pode ser nova (volta pela conta): o próprio nome e clã, sem anunciar entrada (OG-321)
    const self = [message('playerName', { pid, name: c.identity.name }), ...(c.identity.clanTag ? [message('playerClan', { pid, tag: c.identity.clanTag })] : [])];
    this.send(pid, [...this.welcomeMessages(pid), ...self, message('resumeToken', { token: c.resumeToken })]);
    return { ok: true, pid };
  }

  private get reconnectFrames(): number {
    if (this.mode === 'ranked' && this.options.reconnectSeconds !== 0) return RANKED_RECONNECT_FRAMES; // D-46; 0 = sem reconexão
    return Math.round((this.options.reconnectSeconds ?? 15) * 10);
  }

  /** Jogo em andamento (fora do placar de fim e do lobby Ranked). */
  private get inGame(): boolean {
    return this.gameOverUntil === null && (!this.lobby || this.lobby.playing);
  }

  /** Saída (`client_disconnected` → `removePlayer`); os deltas do ranking vão antes. */
  leave(pid: number): void {
    const c = this.clients.get(pid);
    if (!c) return;
    this.flushDeltas(pid);
    this.sim.removePlayer(pid); // apaga os foguetes do jogador para quem os via
    this.colors.release(this.world.teamOf(pid), c.color);
    this.clients.delete(pid);
    this.pause?.undrop(pid, this.uptimeFrames); // prazo esgotado, saída ou expulsão: não espera mais por ele
    this.pause?.removeVoter(pid);
    for (const viewers of this.rocketViewers) viewers?.delete(pid);
    if (this.lobby) {
      this.lobby.leave(pid, this.world.frame);
      this.dropSwapRequests(pid);
      this.lobbyDirty = true;
    }
    this.broadcast(message('playerLeft', { pid }));
    this.checkBotsPending = true;
    this.checkTeamChanges();
    this.checkMapExit();
  }

  /** Um bot a mais, como `/bot add 1` (soma em `extra_bots`). */
  addBot(name?: string): JoinResult {
    const res = this.spawnBot(name);
    if (res.ok) this.extraBots++;
    return res;
  }

  /** Bot com IA (OG-053): cliente virtual que ocupa uma vaga e dá lugar a humanos; sem nome, um de `bot_name_lang`. */
  private spawnBot(name?: string): JoinResult {
    const botName = name ?? createBotName(this.botNameRng, this.settings.server.botNameLang, this.reservedBotNames, [...this.clients.values()].map((c) => c.identity.name));
    const bot = new BotClient(this.botHost(), this.botRng, this.now, this.newBotSkill());
    const res = this.join(bot, { name: botName, accountId: null }, { bot: true });
    if (res.ok) bot.attach(res.pid);
    else bot.close();
    return res;
  }

  /** Nível de um bot que entra: o de `bot_level`, ou um sorteado de 1 a 5 no modo variável (OG-289). */
  private newBotSkill(): BotSkill {
    const level = this.settings.server.botLevel;
    return botSkill(level === 0 ? 1 + (this.botLevelRng.rand() % BOT_LEVELS.length) : level);
  }

  /** Quantidade fixa de bots (`min_bots`, sem `bots_fill` nem os extras do /bot) e nível. */
  private applyCasualBots(c: CasualBots): void {
    const s = this.settings.server;
    s.minBots = Math.min(c.bots, this.options.maxPlayers - 1);
    s.botsFill = 0;
    s.botLevel = Math.min(BOT_LEVELS.length, c.level);
    this.extraBots = 0;
  }

  /** `casualBots` (OG-289, D-51): só o dono da sala privada ou admin, no Casual; vale na próxima partida. */
  private casualBots(pid: number, m: MessageOf<'casualBots'>): void {
    const c = this.clients.get(pid);
    if (!c || !this.canConfigureBots(c)) return this.queueTo(pid, message('text', { kind: 'warning', from: 255, text: 'Only the room owner can change the bots.' }));
    this.pendingCasualBots = { bots: Math.min(m.bots, this.options.maxPlayers - 1), level: Math.min(BOT_LEVELS.length, m.level) };
    const level = m.level === 0 ? 'variable level' : `level ${this.pendingCasualBots.level}`;
    this.broadcast(message('text', { kind: 'server', from: 255, text: `${c.identity.name} set ${this.pendingCasualBots.bots} bots (${level}) for the next game.` }));
    if (m.restart) {
      this.broadcast(message('text', { kind: 'server', from: 255, text: `${c.identity.name} decided it's time for a restart.` }));
      this.nextMap('vote', this.mapIndex);
    }
    this.sendCasualConfig();
  }

  private canConfigureBots(c: Client): boolean {
    return this.mode === 'casual' && !c.bot && (c.identity.owner === true || c.identity.admin === true);
  }

  /** Configuração de bots em vigor, para quem pode mudá-la (habilita a opção no cliente). */
  private sendCasualConfig(only?: number): void {
    const s = this.settings.server;
    const msg = message('casualConfig', { bots: s.minBots, level: s.botLevel, pending: this.pendingCasualBots !== null });
    for (const [pid, c] of this.clients) if ((only === undefined || pid === only) && this.canConfigureBots(c)) this.queueTo(pid, msg);
  }

  /** Começo da partida seguinte: entra a configuração pendente; os bots presentes trocam de nível. */
  private applyPendingCasualBots(): void {
    if (!this.pendingCasualBots) return;
    this.applyCasualBots(this.pendingCasualBots);
    this.pendingCasualBots = null;
    for (const bot of this.botClients()) bot.skill = this.newBotSkill();
    this.checkBotsPending = true;
    this.sendCasualConfig();
  }

  private botHost(): BotHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- o bot guarda a sala
    const room = this;
    return {
      get frame() {
        return room.world.frame;
      },
      botPing: () => room.settings.server.botPing,
      mapByFile: (file) => room.rotation.find((r) => r.file === file)?.map,
      deliver: (pid, messages) => room.handle(pid, messages),
    };
  }

  /** Espectador ao vivo (OG-092): recebe o replay com `spectating_delay`; false com a sala cheia de espectadores. */
  addSpectator(conn: Connection): boolean {
    return this.spectators.add(conn);
  }

  removeSpectator(conn: Connection): void {
    this.spectators.remove(conn);
  }

  get spectatorCount(): number {
    return this.spectators.count;
  }

  /** Clientes virtuais dos bots presentes. */
  botClients(): BotClient[] {
    return [...this.clients.values()].flatMap((c) => (c.bot && c.conn instanceof BotClient ? [c.conn] : []));
  }

  /** `init_bots` (RN-BOT-01): tira os bots que sobram ou completa até o necessário. */
  private checkBots(): void {
    this.checkBotsPending = false;
    if (this.mode === 'ranked') return;
    const s = this.settings.server;
    const bots = this.bots().length;
    const needed = neededBots({ humans: this.clients.size - bots, maxPlayers: this.world.maxPlayers, minBots: s.minBots, botsFill: s.botsFill, balanceBot: s.balanceBot, extraBots: this.extraBots, botTest: this.options.botTest ?? false });
    for (let i = bots; i > needed; i--) this.dropBot(botToRemove(this.slots(), this.world.maxPlayers));
    for (let i = bots; i < needed; i++) if (!this.spawnBot().ok) break;
    this.checkBotsPending = false; // as entradas e saídas acima já estão contadas
  }

  /** Tira um bot, como `/bot remove 1` (desconta de `extra_bots`). */
  removeBot(pid: number): void {
    if (!this.clients.get(pid)?.bot) return;
    this.extraBots--;
    this.dropBot(pid);
  }

  /** `remove_bot` → `disconnectPlayer(kick)`. */
  private dropBot(pid: number): void {
    if (this.clients.get(pid)?.bot) this.leave(pid);
  }

  /** Nome de quem está na vaga (vazio se livre). */
  playerName(pid: number): string {
    return this.clients.get(pid)?.identity.name ?? '';
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
    this.lobbyMoved([[from, to]]);
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
    this.lobbyMoved([[a, b], [b, a]]);
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
    if (mode === 'no' || this.lobby) return; // no lobby Ranked os lados são escolhidos no lobby (OG-253)
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
          if (this.pause?.active) break; // pausado: ninguém se mexe nem mira (OG-260)
          pl.controls = clearModifiersIfIdle(m.controls & 0x3f);
          pl.accelerationMode = (m.gundir & 0x800) !== 0 && this.settings.physics.allowFreeTurning ? 'gun' : 'world';
          if (!pl.dead) {
            if (this.settings.physics.allowFreeTurning) pl.gundir = (m.gundir & 0x7ff) / 256;
            else if (!isStrafe(pl.controls)) pl.gundir = gunDirectionFromControls(pl.gundir, pl.controls);
          }
          break;
        }
        case 'fire':
          if (this.pause?.active) break;
          if (m.on) {
            pl.attack = true;
            pl.attackOnce = true;
            pl.attackGunDir = pl.gundir;
          } else pl.attack = false;
          break;
        case 'dropFlag':
          if (this.pause?.active) break;
          this.sim.setDropKey(pid, m.on);
          break;
        case 'suicide':
          if (this.pause?.active) break;
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
        case 'lobbyReady':
          if (this.lobby?.setReady(pid, m.ready, this.world.frame)) this.lobbyDirty = true;
          break;
        case 'lobbyVote':
          if (this.lobby?.vote(pid, m.map, this.world.frame)) this.lobbyDirty = true;
          break;
        case 'lobbySide':
          this.lobbySide(pid, m.target);
          break;
        case 'lobbySwapAnswer':
          this.lobbySwapAnswer(pid, m.from, m.accept);
          break;
        case 'pauseRequest':
          this.pauseRequest(pid, m.on);
          break;
        case 'substituteVote':
          this.pause?.cast(pid, m.bot);
          break;
        case 'casualBots':
          this.casualBots(pid, m);
          break;
        case 'changeTeam':
          if (this.lobby) break; // no lobby Ranked a troca de lado é pelo `lobbySide` (OG-253)
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
    if (this.kicks.length > 50) this.kicks.shift();
    this.options.onMisbehavior?.({ name: c.identity.name, ip: c.identity.ip, reason });
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
    if (this.checkBotsPending) this.checkBots();
    for (const c of this.clients.values()) c.guard.tick();
    if (this.draining && ![...this.clients.values()].some((c) => !c.bot)) this.finished = true;
    if (this.gameOverUntil !== null && world.frame >= this.gameOverUntil) {
      this.gameOverUntil = null;
      if (this.draining) {
        // a partida seguinte não começa: o placar já foi mostrado e o resultado enviado
        this.finished = true;
        return;
      }
      if (this.lobby && !this.lobby.playing) {
        // fim de um jogo da série: o placar já foi mostrado; a sala volta ao lobby ou fecha (D-41)
        if (this.lobby.phase === 'finished') this.finished = true;
      } else {
        this.sim.startGame();
        this.broadcast(message('startGame', {}), this.mapTimeMessage());
        this.startRecording();
      }
    }
    if (this.lobby) this.lobbyTick();
    const inGame = this.inGame;
    for (let r = this.pause?.decide(this.uptimeFrames); r; r = this.pause?.decide(this.uptimeFrames)) {
      if (r.bot && this.substitutes < MAX_SUBSTITUTES) this.substitute(r.pid);
      else this.goShort(r.pid);
    }
    if (this.pause?.tick(this.uptimeFrames)) this.broadcast(this.mapTimeMessage()); // retomou: relógio do cliente no lugar
    const paused = inGame && (this.pause?.active ?? false);
    const running = inGame && !paused;
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
    const flagModes = this.sim.flagModes();
    const flagModesKey = JSON.stringify(flagModes);
    if (flagModesKey !== this.sentFlagModes) {
      // `send_flag_modes(pid_all)` quando a máscara muda (troca de mapa ou /set)
      if (this.sentFlagModes !== '') this.broadcast(message('flagModes', flagModes));
      this.sentFlagModes = flagModesKey;
    }
    this.playerTimers(running);
    this.sendPauseState();
    this.flush();
    if (running && this.recorder) this.spectators.frame(this.recorder.frame(this.replayFrame()));
    this.spectators.tick(world.frame, this.settings.server.spectatingDelay);
    const views = minimapViews(world, this.settings);
    const ping = this.nextPing();
    for (const [pid, c] of this.clients) {
      // pausado o frame continua indo (o mesmo número): o cliente mostra o mundo parado
      const { frame, properties } = buildFrame(world, this.settings, views, pid, c.rs, { running: inGame, lastClientFrame: c.lastClientFrame, frameOffset: c.frameOffset, ping });
      const extra = properties.length ? [message('minimapProperties', { players: properties })] : [];
      this.send(pid, [...c.queue, message('frame', frame), ...extra]);
      c.queue = [];
    }
    this.frameSentTime = this.now();
    this.thinkAfterBroadcast();
    // `bot_loop` de cada bot: recebe o que chegou (com `bot_ping`) e decide para o próximo frame
    if (paused) return; // o mundo não anda: nem frame, nem bots (OG-260)
    for (const bot of this.botClients()) bot.step();
    world.frame++;
  }

  /** Pedido de pausa (on) ou de retomada (off) do time do jogador (OG-260, RN-RKL-15/16). */
  private pauseRequest(pid: number, on: boolean): void {
    const pause = this.pause;
    if (!pause || !this.inGame) return this.queueTo(pid, message('text', { kind: 'warning', from: 255, text: PAUSE_TEXT.unavailable }));
    const team = this.world.teamOf(pid) as 0 | 1;
    const refusal = on ? pause.request(team, pid) : pause.resume(team, this.uptimeFrames);
    if (refusal) return this.queueTo(pid, message('text', { kind: 'warning', from: 255, text: PAUSE_TEXT[refusal] }));
    if (on) this.releaseKeys();
  }

  /**
   * Desconexão permanente no jogo Ranked (OG-262, RN-RKL-18/19): o time desfalcado vota entre bot e
   * um a menos; sem bot disponível (limite de 2 por partida), segue direto com um a menos.
   */
  private depart(pid: number): void {
    const c = this.clients.get(pid);
    const pause = this.pause;
    if (!c || !pause) return;
    const offered = this.substitutes + pause.votes.length;
    if (offered >= MAX_SUBSTITUTES) return this.goShort(pid);
    c.departing = true;
    const team = this.world.teamOf(pid) as 0 | 1;
    const voters = [...this.clients].filter(([p, o]) => p !== pid && !o.bot && o.conn !== OFFLINE && this.world.teamOf(p) === team).map(([p]) => p);
    pause.depart(pid, team, voters, this.uptimeFrames);
  }

  /**
   * Bot substituto (OG-262): assume a vaga (o mesmo pid, com os frags e a bandeira) como `BOT-<nome>`,
   * com o clã do substituído (clã x clã, OG-259). É o único caminho de bot no Ranked (RN-MOD-06).
   */
  private substitute(pid: number): void {
    const c = this.clients.get(pid);
    if (!c?.departing) return;
    this.flushDeltas(pid); // o que a pessoa fez até aqui é dela; o bot não pontua (sem conta)
    const { identity } = c;
    const bot = new BotClient(this.botHost(), this.botRng, this.now, botSkill(identity.botLevel)); // nível pelo histórico (OG-266)
    Object.assign(c, {
      conn: bot,
      bot: true,
      departing: false,
      disconnectedFrame: null,
      replaced: { identity, resumeToken: c.resumeToken },
      identity: { name: `BOT-${identity.name}`, accountId: null, clanTag: identity.clanTag ?? null, clanId: identity.clanId ?? null },
      deltas: new RankingDeltas(),
      hasInput: false,
      queue: [],
      rs: new RecipientState(),
    });
    this.substitutes++;
    this.substitutions.push({ kind: 'bot', team: this.world.teamOf(pid) as 0 | 1, atSeconds: Math.trunc(this.world.mapTime() / 10) });
    const pl = this.world.players[pid] as PlayerState;
    pl.awaitingClientReadies = 0; // bot não carrega mapa
    bot.attach(pid);
    this.send(pid, this.welcomeMessages(pid));
    this.broadcast(message('playerName', { pid, name: c.identity.name }));
  }

  /** O time segue com um a menos (OG-262/263). */
  private goShort(pid: number): void {
    if (!this.clients.has(pid)) return;
    this.substitutions.push({ kind: 'short', team: this.world.teamOf(pid) as 0 | 1, atSeconds: Math.trunc(this.world.mapTime() / 10) });
    this.leave(pid);
  }

  /** Fim do jogo: o bot substituto não passa para o próximo (D-43) e quem saiu no meio do voto sai; a vaga reabre. */
  private dropSubstitutes(): void {
    for (const [pid, c] of [...this.clients]) if (c.replaced || c.departing) this.leave(pid);
    this.substitutes = 0;
    this.substitutions = [];
  }

  /** Ninguém fica com tecla presa durante a pausa. */
  private releaseKeys(): void {
    for (const p of this.world.players) {
      if (!p) continue;
      p.controls = 0;
      p.attack = false;
      p.attackOnce = false;
    }
  }

  /** `pauseState` para todos quando algo visível muda (fase, segundos, saldo). */
  private sendPauseState(): void {
    if (!this.pause) return;
    const msg = this.pauseStateMessage();
    const key = JSON.stringify(msg);
    if (key === this.sentPause) return;
    this.sentPause = key;
    this.broadcast(msg);
  }

  private pauseStateMessage(): AnyMessage {
    const pause = this.pause!;
    const cause = pause.cause;
    const state = {
      phase: pause.phase,
      reason: cause?.reason ?? 'team',
      team: cause?.team ?? 0,
      by: cause?.by ?? 255, // 255 = ninguém (`pidOrNone`)
      seconds: pause.seconds(this.uptimeFrames),
      redSeconds: Math.ceil(pause.balance[0] / 10),
      redRequests: PAUSE_REQUESTS - pause.requests[0],
      blueSeconds: Math.ceil(pause.balance[1] / 10),
      blueRequests: PAUSE_REQUESTS - pause.requests[1],
      votesBot: pause.tally()[0],
      votesShort: pause.tally()[1],
    } as const;
    return message('pauseState', state);
  }

  /** Ping de um jogador por frame, em rodízio (bots informam o `botPing` da sala). */
  private nextPing(): { pid: number; ms: number } | null {
    const pids = [...this.clients.keys()].sort((a, b) => a - b);
    if (pids.length === 0) return null;
    const pid = pids.find((p) => p > this.pingCursor) ?? (pids[0] as number);
    this.pingCursor = pid;
    const c = this.clients.get(pid) as Client;
    const ms = c.bot ? this.settings.server.botPing : c.conn.rtt?.();
    return ms === undefined ? null : { pid, ms: Math.min(65535, Math.max(0, Math.round(ms))) };
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
    // pausa tática pelo chat (D-45): /pause e /resume
    const cmd = text.trim().toLowerCase();
    if (cmd === '/pause' || cmd === '/resume') return this.pauseRequest(pid, cmd === '/pause');
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
    else {
      for (const other of this.viewers((p) => p.team === this.world.teamOf(pid))) this.queueTo(other, msg);
      this.recorder?.event(msg); // o replay vê o chat dos dois times, como o original
    }
    if (this.settings.server.logPlayerChat) this.options.log?.(`(chat) ${c.identity.name} [${c.identity.ip ?? '?'}]: ${text}`);
  }

  private isBanned(identity: Identity): boolean {
    const now = Date.now();
    const keys = [identity.accountId && `acct:${identity.accountId}`, identity.ip && `ip:${identity.ip}`, identity.device && `dev:${identity.device}`].filter(Boolean) as string[];
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
        // `<=`: o relógio da sala anda no início do tick; sai no tick em que se completam os frames da queda
        if (c.departing || this.uptimeFrames - c.disconnectedFrame <= this.reconnectFrames) continue;
        // queda no jogo Ranked sem volta no prazo: desconexão permanente e voto do bot (OG-262)
        if (this.pause?.drops.has(pid)) this.depart(pid);
        else this.leave(pid);
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
      ...(c.identity.device ? { device: c.identity.device } : {}),
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
          if (c.identity.device) this.bans.set(`dev:${c.identity.device}`, until);
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
        // mais power-ups (`/set pups_*`, `/carnage on`, OG-290): os que faltam já entram na fila
        if (this.inGame && /^pups_/.test(line)) this.sim.powerupSettingsChanged();
        this.broadcast(this.serverSettingsMessage(), this.mapTimeMessage());
      },
      resetSettings: () => {
        const fresh = settingsOf(this.preset);
        for (const group of ['world', 'powerups', 'physics', 'server'] as const) Object.assign(this.settings[group], fresh[group]);
        if (this.mode === 'casual' && this.options.botsFill !== undefined) this.settings.server.botsFill = this.options.botsFill;
        this.checkBotsPending = true;
        this.setLines = [];
        this.broadcast(this.serverSettingsMessage(), this.mapTimeMessage());
        this.sendCasualConfig();
      },
      audit: (entry) => this.options.audit?.(this.id, entry),
      report: (reporter, target, reason) => {
        if (!this.reports.allow(reporter, target, this.uptimeFrames)) return false;
        this.options.reportPlayer?.({ roomId: this.id, map: this.world.map.title, reporter, target, reason });
        return true;
      },
      ...(this.mode === 'ranked' ? {} : { bots: this.botConsole() }),
    };
  }

  private botConsole(): BotConsole {
    return {
      maxPlayers: this.world.maxPlayers,
      extra: () => this.extraBots,
      setExtra: (n) => {
        this.extraBots = n;
      },
      playerCount: () => this.clients.size,
      changed: () => {
        this.checkBotsPending = true;
      },
      rename: (pid, name) => {
        const c = this.clients.get(pid);
        if (!c) return;
        c.identity = { ...c.identity, name };
        this.broadcast(message('playerName', { pid, name }));
      },
    };
  }

  /** `start_recording`: replay novo a cada início de partida, com o estado inicial de um espectador. */
  /** Grava sempre: o stream serve aos espectadores ao vivo; o arquivo só fica se houver destino. */
  private startRecording(): void {
    const init = this.welcomeMessages(-1).filter((m) => m.type !== 'welcome');
    const mapText = this.options.generatedMaps?.text(this.mapFile(this.mapIndex));
    this.recorder = new ReplayRecorder(
      {
        roomId: this.id,
        mode: this.mode,
        preset: this.preset.id,
        map: this.mapFile(this.mapIndex),
        mapTitle: this.world.map.title,
        // mapa gerado (OG-015): o texto vai no replay, porque não existe em maps/
        ...(mapText !== undefined ? { mapText } : {}),
        maxPlayers: this.world.maxPlayers,
        startedAt: new Date(this.wallClock()).toISOString(),
        startFrame: this.world.frame,
      },
      init,
    );
    this.spectators.begin(this.recorder.replayHeader, this.recorder.initChunk);
  }

  /**
   * `stop_recording`: fecha o frame do fim (os eventos do placar ainda estão no outbox) e grava se houver
   * humanos suficientes (`recording`, mínimo 1 — D-28). Devolve a URL do replay.
   */
  private finishRecording(key: string): string | null {
    const recorder = this.recorder;
    this.recorder = null;
    if (!recorder) return null;
    recorder.event(...this.outbox);
    this.spectators.frame(recorder.frame(this.replayFrame()));
    if (!this.options.replays) return null;
    const humans = [...this.clients.values()].filter((c) => !c.bot).length;
    if (humans < Math.max(1, this.settings.server.recording)) return null;
    return this.options.replays.save(key, recorder.finish());
  }

  /** Frame do replay: todos os jogadores, como `buildFrame` os mostraria a quem está na sala deles. */
  private replayFrame(): AnyMessage {
    const world = this.world;
    const time = world.time;
    const players = [...this.clients.keys()].map((pid) => {
      const h = world.players[pid] as PlayerState;
      const safeAfterSpawn = world.frame < h.startTakeDamageFrame;
      return {
        pid,
        roomX: h.pos.roomX,
        roomY: h.pos.roomY,
        x: h.pos.x,
        y: h.pos.y,
        vx: h.dead ? 0 : h.vel.x,
        vy: h.dead ? 0 : h.vel.y,
        dead: h.dead,
        deathbringer: h.deathbringer,
        deathbringerAffected: h.deathbringerEnd > time,
        shield: h.shield !== 0,
        turbo: h.turbo,
        power: h.power,
        controls: h.dead ? 0 : h.controls,
        gundir: iround(h.gundir * 256) % 2048,
        visibility: safeAfterSpawn ? (world.frame & 2 ? 128 : 220) : h.visibility,
      };
    });
    return message('replayFrame', { frame: world.frame, players });
  }

  /** Fim de partida no meio do frame (`server_next_map`): próximo mapa da rotação e placar. */
  private onGameOver(reason: GameOverReason, result: MatchResult): void {
    this.results.push(result);
    this.pause?.reset(); // saldo de pausa por jogo, também na série (D-45)
    // `server_next_map`: movimento e tiros de todos e `stats_ready` antes do placar (e no fim do replay)
    this.broadcast(...endOfGameMessages([...this.clients.keys()].map((pid) => this.world.players[pid] as PlayerState), [this.world.teams[0], this.world.teams[1]]));
    this.report(result);
    this.dropSubstitutes();
    if (this.lobby) return this.lobbyGameOver(reason);
    this.nextMap(reason);
  }

  private wallClock(): number {
    return this.options.wallClock?.() ?? Date.now();
  }

  /** Quem está no slot (para o resultado e os mínimos do ranking). */
  private reportPlayer(pid: number): ReportPlayer | undefined {
    const c = this.clients.get(pid);
    return c ? { name: c.identity.name, accountId: c.identity.accountId, bot: c.bot, botKills: c.botKills, clanId: c.identity.clanId ?? null } : undefined;
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
    const serverMatchId = `${this.id}-${this.createdAt.toString(36)}-${this.matchCount}`;
    const replayUrl = this.finishRecording(serverMatchId);
    const series = this.recordSeriesGame(result.winner);
    if (!this.options.reportMatch || ![...this.clients.values()].some((c) => !c.bot)) return;
    this.options.reportMatch(
      matchReport({
        serverMatchId,
        ...(replayUrl ? { replayUrl } : {}),
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
        ...(this.options.ranked ? { format: this.options.ranked.format } : {}),
        ...(series ? { series } : {}),
        substitutions: this.substitutions,
      }),
    );
  }

  // --- lobby Ranked (OG-252..254) ---

  /** Eventos do lobby e o estado para os jogadores quando algo mudou. */
  private lobbyTick(): void {
    const lobby = this.lobby!;
    for (const e of lobby.tick(this.world.frame)) {
      this.lobbyDirty = true;
      if (e.type === 'phase' && e.phase === 'vote') this.applyLobbyRotation();
      else if (e.type === 'start') this.startLobbyGame(e.map);
      else if (e.type === 'kick') {
        // não marcou "Pronto" a tempo: sai e a vaga reabre (RN-RKL-21)
        for (const pid of e.pids) {
          const c = this.clients.get(pid);
          if (!c) continue;
          c.conn.send(encodeFrame(message('text', { kind: 'server', from: 255, text: 'Você não marcou "Pronto" a tempo e saiu da sala.' }), message('disconnecting', { reason: 'kick', seconds: 0 })));
          c.conn.close(4000, 'notReady');
          this.leave(pid);
        }
      }
    }
    if (this.lobbyDirty) {
      this.lobbyDirty = false;
      this.broadcast(this.lobbyStateMessage());
    }
  }

  private lobbyStateMessage(): AnyMessage {
    const lobby = this.lobby!;
    const score = this.series?.score;
    return message('lobbyState', {
      phase: lobby.phase,
      teamSize: lobby.capacity / 2,
      bestOf: score?.bestOf ?? 1,
      gameNo: score ? Math.min(score.bestOf, score.games + (lobby.phase === 'finished' ? 0 : 1)) : 1,
      seriesRed: score?.wins[0] ?? 0,
      seriesBlue: score?.wins[1] ?? 0,
      seconds: lobby.secondsLeft(this.world.frame),
      chosenMap: lobby.chosenMap,
      members: [...lobby.members].map(([pid, m]) => ({ pid, ready: m.ready, vote: m.vote })),
      swaps: [...this.swapRequests].map(([from, to]) => ({ from, to })),
    });
  }

  /** Rotação nova do painel entra no começo do voto (os votos são índices nela, OG-251). */
  private applyLobbyRotation(): void {
    if (!this.pendingRotation) return;
    this.rotation.splice(0, this.rotation.length, ...this.pendingRotation.map((r) => ({ ...r, lastGame: 0 })));
    this.pendingRotation = null;
    this.lobby!.setMapCount(this.rotation.length);
    this.broadcast(this.mapListMessage());
  }

  /** Fim da contagem: o mapa votado carrega e o jogo começa para todos juntos (RN-RKL-11). */
  private startLobbyGame(map: number): void {
    this.swapRequests.clear();
    this.nextMap('vote', map);
    this.gameOverUntil = this.world.frame + 1;
  }

  /** Fim de um jogo da série: placar na tela e volta ao lobby (ou fim da série, D-41). */
  private lobbyGameOver(reason: GameOverReason): void {
    this.flushDeltas();
    this.lobby!.gameEnded(this.series ? seriesOver(this.series.score) : true, this.world.frame);
    this.gameOverUntil = this.world.frame + Math.round(this.settings.server.gameEndDelay * 10);
    this.broadcast(message('gameOver', { reason, seconds: this.settings.server.gameEndDelay }));
    this.lobbyDirty = true;
  }

  /** Lado trocado: o lobby segue o jogador e os pedidos de troca envolvidos caem. */
  private lobbyMoved(moves: [number, number][]): void {
    if (!this.lobby) return;
    for (const [from] of moves) this.dropSwapRequests(from);
    this.lobby.moved(moves, this.world.frame);
    this.lobbyDirty = true;
  }

  private dropSwapRequests(pid: number): void {
    for (const [from, to] of [...this.swapRequests]) if (from === pid || to === pid) this.swapRequests.delete(from);
  }

  /** Trocar de lado no lobby (RN-RKL-09): vaga livre do outro lado ou pedido a um jogador de lá. */
  private lobbySide(pid: number, target: number): void {
    const lobby = this.lobby;
    if (!lobby || lobby.playing || lobby.phase === 'finished') return;
    const other = 1 - this.world.teamOf(pid);
    if (target === 255) {
      const slot = freeSlot(this.slots(), this.world.maxPlayers, other);
      if (slot !== -1) this.movePlayer(pid, slot);
      return;
    }
    if (!this.clients.has(target) || this.world.teamOf(target) !== other) return;
    // os dois pediram: troca na hora
    if (this.swapRequests.get(target) === pid) return this.swapPlayers(pid, target);
    this.swapRequests.set(pid, target);
    this.lobbyDirty = true;
  }

  private lobbySwapAnswer(pid: number, from: number, accept: boolean): void {
    if (!this.lobby || this.swapRequests.get(from) !== pid) return;
    this.swapRequests.delete(from);
    this.lobbyDirty = true;
    if (accept && !this.lobby.playing && this.world.teamOf(from) !== this.world.teamOf(pid)) this.swapPlayers(from, pid);
  }

  /** Formato e placar da série em andamento (OG-250); undefined fora das salas com formato. */
  get rankedSeries(): (RankedRoomFormat & { no: number; score: SeriesScore }) | undefined {
    return this.options.ranked && this.series ? { ...this.options.ranked, ...this.series } : undefined;
  }

  /** Soma o jogo à série (abre a próxima se a anterior acabou) e devolve o que vai no relatório. */
  private recordSeriesGame(winner: 0 | 1 | null): MatchReport['series'] {
    if (!this.series) return undefined;
    if (seriesOver(this.series.score)) this.series = { no: this.series.no + 1, score: newSeries(this.series.score.bestOf) };
    const score = recordSeriesGame(this.series.score, winner);
    this.series.score = score;
    const finished = seriesOver(score);
    return {
      serverSeriesId: `${this.id}-${this.createdAt.toString(36)}-s${this.series.no}`,
      bestOf: score.bestOf,
      gameNo: score.games,
      redWins: score.wins[0],
      blueWins: score.wins[1],
      finished,
      winner: finished ? seriesWinner(score) : null,
    };
  }

  /** Votantes (RN-VOT). */
  private voters(): Voter[] {
    return [...this.clients.values()].map((c) => ({ bot: c.bot, wantExit: c.wantMapExit, mapVote: c.mapVote, negative: c.negativeVotes }));
  }

  /** `check_map_exit`: atualiza os votos por mapa e troca de mapa se a maioria quer sair. */
  private checkMapExit(): void {
    this.sendVotes();
    if (this.gameOverUntil !== null) return; // já trocando
    if (this.lobby) return; // no lobby Ranked o mapa é votado no lobby (OG-254), não no meio do jogo
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
      // entrada aleatória aparece como `<Random>` com o tamanho pedido (`net_data_quick_map_list`)
      maps: this.rotation.map((r, i) =>
        r.random
          ? { file: 'random', title: '<Random>', author: 'Outgun', width: r.random.width, height: r.random.height, votes: votes[i] ?? 0 }
          : { file: r.file, title: r.map.title, author: r.map.author, width: r.map.width, height: r.map.height, votes: votes[i] ?? 0 },
      ),
    });
  }

  /** `server_next_map`: escolhe o próximo mapa (RN-VOT-03), zera os votos nele e mostra o placar. */
  private nextMap(reason: GameOverReason | 'vote', forced?: number): void {
    this.pause?.reset();
    this.applyPendingCasualBots();
    this.dropSubstitutes();
    this.flushDeltas(); // `ctf_game_restart`; no fim de partida já foram com o resultado
    if (this.pendingRotation && !this.lobby) {
      // rotação nova do painel (OG-087): entra na troca de mapa, começando pelo primeiro; votos zerados
      this.rotation.splice(0, this.rotation.length, ...this.pendingRotation.map((r) => ({ ...r, lastGame: 0 })));
      this.pendingRotation = null;
      for (const c of this.clients.values()) {
        c.mapVote = -1;
        c.negativeVotes.clear();
      }
      forced = 0;
      this.broadcast(this.mapListMessage());
    }
    const voters = this.voters();
    const votes = mapVotes(voters, this.rotation.length);
    const negative = (map: number) => voters.filter((v) => v.negative.has(map)).length;
    // /forcemap: o mapa escolhido ganha 99 votos no original, o que o torna o próximo
    this.mapIndex = forced ?? nextMap(this.rotation, votes, this.mapIndex, this.world.frame, negative, this.sim.rng);
    for (const c of this.clients.values()) {
      c.wantMapExit = false;
      if (c.mapVote === this.mapIndex) c.mapVote = -1;
    }
    const entry = this.rotation[this.mapIndex] as RotationEntry;
    entry.lastGame = this.world.frame;
    // `random_map` (OG-015): um mapa novo cada vez que a entrada entra, como o `load_rotation_map`
    if (entry.random && this.options.generatedMaps) {
      const generated = this.options.generatedMaps.generate(entry.random);
      entry.map = generated.map;
      entry.file = generated.file;
    }
    this.matchStartedAt = this.wallClock();
    for (const c of this.clients.values()) c.botKills = 0;
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
    this.recorder?.event(...this.outbox);
    const data = encodeFrame(...this.outbox);
    this.outbox = [];
    for (const c of this.clients.values()) {
      c.bytes += data.length;
      c.conn.send(data);
    }
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

  /**
   * Drenagem (OG-103): avisa os jogadores; a sala fecha no fim da partida em andamento (o placar e o
   * resultado saem normalmente), ou na hora se só houver bots.
   */
  drain(): void {
    if (this.draining) return;
    this.draining = true;
    this.broadcast(message('text', { kind: 'warning', from: 255, text: 'The server is restarting: this room will close at the end of the current match.' }));
  }

  /** Rotação que entra na próxima troca de mapa (painel admin, OG-087). */
  private pendingRotation: { map: GameMap; file: string; random?: RandomMapParams }[] | null = null;

  setRotation(entries: readonly { map: GameMap; file: string; random?: RandomMapParams }[]): void {
    if (entries.length === 0) return;
    const same = entries.length === this.rotation.length && entries.every((e, i) => e.file === this.rotation[i]?.file);
    this.pendingRotation = same ? null : [...entries];
  }

  /** Jogadores para o painel admin (heartbeat, OG-087). */
  roster(): { uid: number; name: string; team: number; accountId?: string; bot: boolean; muted: number }[] {
    return [...this.clients].map(([pid, c]) => ({
      uid: c.uid,
      name: c.identity.name.slice(0, 32),
      team: this.world.teamOf(pid) === 1 ? 1 : 0,
      ...(c.identity.accountId ? { accountId: c.identity.accountId } : {}),
      bot: c.bot,
      muted: c.muted,
    }));
  }

  /**
   * Comando do painel admin (OG-087), pelas mesmas ações do console (`/kick`, `/ban`, `/mute`):
   * o autor aparece pelo nome de quem usou o painel. A auditoria já foi feita na API.
   */
  remoteCommand(cmd: RemoteCommand): RemoteResult {
    const actor: ConsolePlayer = { pid: -1, uid: -1, name: cmd.actor, team: -1, account: null, admin: true, muted: 0, bot: false, ranked: false };
    if (cmd.kind === 'message') {
      if (!cmd.text) return { ok: false, text: 'no text' };
      this.console.broadcastText('admin', `${cmd.actor}: ${cmd.text}`);
      return { ok: true };
    }
    const entry = [...this.clients].find(([, c]) => c.uid === cmd.uid && !c.bot);
    if (!entry) return { ok: false, text: 'player is not in the room any more' };
    const [pid, c] = entry;
    const target = { name: c.identity.name.slice(0, 32), ...(c.identity.accountId ? { accountId: c.identity.accountId } : {}), ...(c.identity.ip ? { ip: c.identity.ip } : {}), ...(c.identity.device ? { device: c.identity.device } : {}) };
    switch (cmd.kind) {
      case 'kick':
      case 'ban': {
        const minutes = cmd.kind === 'ban' ? Math.min(cmd.minutes ?? 60, 7 * 24 * 60) : 0;
        const ok = this.console.kick(pid, actor, minutes, cmd.reason ?? '');
        return ok ? { ok, target } : { ok, text: 'already being kicked' };
      }
      case 'mute':
      case 'unmute':
        this.console.setMuted(pid, cmd.kind === 'mute' ? 1 : 0, actor, true);
        return { ok: true, target };
    }
  }

  /** Encerra a sala: avisa e fecha todas as conexões. */
  close(): void {
    for (const pid of [...this.clients.keys()]) {
      const c = this.clients.get(pid) as Client;
      c.conn.send(encodeFrame(message('disconnecting', { reason: 'shutdown', seconds: 0 })));
      c.conn.close(1001, 'sala encerrada');
      this.leave(pid);
    }
    this.spectators.close();
  }
}
