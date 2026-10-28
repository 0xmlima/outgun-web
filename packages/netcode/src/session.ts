// SPDX-License-Identifier: GPL-2.0-or-later
// Lado do cliente da conexão de jogo (`ClientBase`, src/clientbase.cpp): guarda o último frame do
// servidor (`fx`), simula os foguetes a partir dos eventos, envia os controles a 10 Hz sincronizados
// com o frame do servidor e extrapola o mundo para o desenho (`ClientWorld::extrapolate`), com a
// predição do próprio jogador. Não sabe nada de relógio nem de transporte: quem usa passa o tempo
// (ms) e entrega/recebe as mensagens. Spec: plan/specs/predicao-interpolacao.md.
import { chatName, message, parseEmblem, PROTOCOL_VERSION, type AnyMessage, type ClanEmblem, type MessageOf } from '@outgun/protocol';
import { applyGamemod, PRESETS, presetSettings, type GameSettings } from '@outgun/settings';
import {
  applyPhysics,
  CarriedFlag,
  controlDirection,
  DeathbringerExplosion,
  FlagState,
  isStrafe,
  MAX_ROCKETS,
  PLAYER_RADIUS,
  PlayerState,
  Position,
  PowerupKind,
  rocketFrameAdvance,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  shootRocketFormation,
  Vec,
  WorldState,
  type GameMap,
  type PhysicsCallbacks,
  type PhysicsContext,
} from '@outgun/sim';

/** Mapa pedido pelo servidor (`mapChange`). */
export type MapRequest = Pick<MessageOf<'mapChange'>, 'file' | 'title' | 'crc' | 'mapIndex'>;

/** Efeitos visuais e sonoros que o cliente cria a partir do que recebe ou simula. */
export type SessionEvent =
  | { kind: 'rocketHitWall'; pos: Position; power: boolean; team: number }
  | { kind: 'rocketHitPlayer'; pos: Position; target: number; team: number }
  | { kind: 'rocketFired'; pos: Position; power: boolean; owner: number }
  /** Quique na parede ou entre jogadores na extrapolação (o original toca o som pelos callbacks de física). */
  | { kind: 'playerHitWall'; pid: number }
  | { kind: 'playerHitPlayer'; pid1: number; pid2: number }
  /** Uma bandeira que estava no chão ou na base passou a ser carregada (`SAMPLE_CTF_GOT`). */
  | { kind: 'flagCarried'; team: number }
  | { kind: 'message'; message: AnyMessage };

export interface SessionOptions {
  /** Envia mensagens ao servidor (ordem preservada). */
  send(messages: AnyMessage[]): void;
  /** O servidor mudou de mapa: carregar e chamar `setMap` (ou `mapFailed`). */
  onMapChange(request: MapRequest): void;
  /** Efeitos e mensagens que a interface mostra (placar, mortes, chat...). */
  onEvent?(event: SessionEvent): void;
  /** Sem tela (cliente virtual de bot): não mede nem suaviza as correções da extrapolação. */
  headless?: boolean;
  /**
   * "Stay dead when in a menu at round start" (OG-070): enquanto devolver true, o `clientReady` da
   * troca de mapa espera (o jogador não nasce); `releaseReady()` o manda.
   */
  holdReady?: () => boolean;
}

/** Opções do jogador para a predição (`lagPrediction`, `lagPredictionAmount` do original). */
export interface PredictionOptions {
  /** Prevê o próprio jogador com os controles ainda não confirmados. */
  enabled: boolean;
  /** 0..10: quanto do atraso é compensado (10 = tudo; menos = "handicap" de lag). */
  amount: number;
}

/** Estatísticas da conexão (depuração, testes e o ping da interface). */
export interface NetStats {
  /** Atraso médio entre enviar os controles e vê-los aplicados, em frames (`averageLag`). */
  averageLag: number;
  /** Último `frameOffset` recebido, em frames (alvo: 0,5). */
  frameOffset: number;
  /** Correções de predição (a posição prevista mudou mais de `CORRECTION_PX` ao chegar um frame). */
  corrections: number;
  framesReceived: number;
}

/** Amostras de latência do input acima disto (ms) são descartadas (morto, pausado, aba parada). */
const LATENCY_SAMPLE_MAX_MS = 1000;

/** Guarda uma amostra sem deixar a lista crescer se ninguém a esvaziar. */
function pushSample(list: number[], ms: number): void {
  if (list.length < 512) list.push(ms);
}

/** Meia-vida (ms) do deslocamento visual que esconde uma correção. */
export const SMOOTHING_HALF_LIFE_MS = 80;
/** Saltos maiores que isto (px) não são suavizados (renascer, colisão forte). */
export const SMOOTHING_SNAP_PX = 48;

/** Diferença (px) que conta como correção de predição. */
export const CORRECTION_PX = 0.5;
/** Mais que isto de extrapolação (frames) não é feito (`timeDelta > 3`). */
const MAX_EXTRAPOLATION = 3;

const u8 = (n: number) => n & 255;

/** Força (u16, 1/256 de oitavo) para direção em oitavos. */
const dirFromNet = (gundir: number) => (gundir & 0x7ff) / 256;

/** Cópia do jogador para a extrapolação (o original copia o `ClientPlayer` inteiro). */
function clonePlayer(src: PlayerState): PlayerState {
  const p = Object.assign(new PlayerState(src.pid, src.team), src);
  p.pos = src.pos.clone();
  return p;
}

/** Lado que virou o clã (OG-408): tag, nome e a cor (null = a padrão do lado). */
export interface TeamIdentityView {
  tag: string;
  name: string;
  color: string | null;
  /** Emblema do clã e as cores dele (`teamEmblem`, OG-486); ausente = sem emblema no chão. */
  emblem?: ClanEmblem;
  colors?: { primary: string; secondary: string };
}

export class ClientSession {
  /** Meu pid; −1 antes do `welcome`. */
  me = -1;
  maxPlayers = 0;
  settings: GameSettings = presetSettings('classic');
  mapRequest: MapRequest | null = null;
  /** Último frame recebido (`fx`); null enquanto não há mapa. */
  world: WorldState | null = null;
  /** O servidor não manda o mundo (carregando o mapa ou placar de fim de partida). */
  skipped = true;
  /** Jogadores que vieram no último frame (`onscreen`). */
  readonly onscreen = new Set<number>();
  /** Nome mostrado: `(TAG) nome` para quem tem clã (OG-206, RN-NOM-04), como no chat. */
  readonly names = new Map<number, string>();
  /** Nome sem a tag e tag do clã de cada jogador (`playerJoined`/`playerName`, `playerClan`). */
  private readonly plainNames = new Map<number, string>();
  readonly clanTags = new Map<number, string>();
  /** Pids ocupados (vale também antes de o mapa carregar). */
  readonly present = new Set<number>();
  /** Pids que são bots (`playerJoined.bot`): a IA não depende mais do prefixo do nome (OG-403). */
  readonly bots = new Set<number>();
  /** O clã que cada lado é nesta rodada (`teamIdentity`, OG-408); null = vermelho/azul. */
  readonly teamIdentity: [TeamIdentityView | null, TeamIdentityView | null] = [null, null];
  /** Muda a cada `teamIdentity`: o cliente refaz cores e texturas. */
  teamIdentityVersion = 0;
  /** Número de cada jogador (`playerNumber`, OG-410). */
  readonly numbers = new Map<number, number>();
  /** Estilo do número de cada jogador (OG-413). */
  readonly numberStyles = new Map<number, number>();
  readonly frags = new Map<number, number>();
  /** Cor pessoal de cada jogador 0..15 (`welcome`, `playerJoined`, `playerInfo`, `teamChange`). */
  readonly colors = new Map<number, number>();
  /** Placar dos times (`welcome`, `scoreUpdate`). */
  readonly teamScores: [number, number] = [0, 0];
  /** Nível da arma do próprio jogador (`weaponChange`). */
  weapon = 1;
  /** Fim de cada power-up com tempo do próprio jogador, em s do jogo (`powerupTimer`). */
  readonly powerupEnd = { power: 0, turbo: 0, shadow: 0 };
  /** Bots da sala Casual em vigor; só chega para o dono e admins, que podem mudá-los (OG-289). */
  casualConfig: MessageOf<'casualConfig'> | null = null;
  /** Início e fim do mapa em s do jogo (`mapTime`); fim null = sem limite de tempo. */
  mapStart = 0;
  mapEnd: number | null = null;
  /** Prorrogação em andamento ("ET" no relógio). */
  extraTime = false;
  /** Placar final enquanto mostra o fim de partida (`gameOver` até `startGame`). */
  gameOver: { reason: MessageOf<'gameOver'>['reason'] | 'vote'; red: number; blue: number } | null = null;
  /** Rotação de mapas (`mapList`), votos por mapa e o índice do mapa atual. */
  mapList: MessageOf<'mapList'>['maps'] = [];
  /** Lobby da sala Ranked com formato (OG-252..256): último `lobbyState`; null nas outras salas. */
  lobby: MessageOf<'lobbyState'> | null = null;
  /** Pausa do jogo Ranked (OG-260): último `pauseState`; null antes do primeiro (salas sem pausa). */
  pause: MessageOf<'pauseState'> | null = null;
  mapVoteCounts: number[] = [];
  currentMapIndex = -1;
  /** Preset da sala (`serverSettings`). */
  preset = 'classic';
  /** Estatísticas para F3/F4 (OG-066): último retrato de cada jogador e o tempo do jogo em que chegou. */
  readonly playerStats = new Map<number, { stats: MessageOf<'stats'>['stats']; at: number }>();
  /** Movimento e tiros de cada jogador (só no fim da partida, como no original). */
  readonly movementShots = new Map<number, MessageOf<'movementShots'>['data']>();
  readonly teamStats: [MessageOf<'teamStats'> | null, MessageOf<'teamStats'> | null] = [null, null];
  teamMovementShots: MessageOf<'teamMovementShots'> | null = null;
  /** Quantas vezes chegou `statsReady` (fim de partida; o cliente abre F3/F4 se configurado). */
  statsReadyCount = 0;
  /** Conta, ranking e admin de cada jogador (`playerInfo`, `data_crap_update`). */
  readonly playerInfo = new Map<number, MessageOf<'playerInfo'>>();
  /** Nome de quem já saiu (capturas antigas na tela F3). */
  readonly pastNames = new Map<number, string>();
  /** Ping de cada jogador (ms), em rodízio no frame. */
  readonly pings = new Map<number, number>();
  /** Frame em que a posição de cada jogador foi vista pela última vez (frame ou minimapa; `posUpdated`). */
  readonly posUpdated = new Map<number, number>();
  private pendingMapTime: MessageOf<'mapTime'> | null = null;
  /** Último frame do servidor recebido (−1 = nenhum), mesmo carregando o mapa. */
  lastServerFrame = -1;
  /** Quando chegou o último pacote do servidor (ms do relógio de quem chama). */
  lastPacketTime = 0;
  /** Quando cada bandeira (`time.índice`) voltou à base, em s do jogo (pisca por 2 s). */
  readonly flagReturnTime = new Map<string, number>();
  /** Fim do pisca de acerto por jogador (ms do relógio de quem chama). */
  readonly hitUntil = new Map<number, number>();
  /** Frame do servidor em que o próprio jogador pode renascer (`waitingTime`). */
  respawnFrame = 0;
  readonly stats: NetStats = { averageLag: 0, frameOffset: 0, corrections: 0, framesReceived: 0 };
  prediction: PredictionOptions = { enabled: true, amount: 10 };
  /**
   * Latência das mudanças de controle (OG-369), em ms desde a tecla: até sair na mensagem `input`
   * (`send`) e até a predição desenhar o jogador com elas (`render`). Quem lê esvazia as listas.
   */
  readonly inputLatency = { send: [] as number[], render: [] as number[] };

  // envio (`clFrameSent`, `controlHistory`, `svFrameHistory`)
  private clFrameSent = 0;
  private clFrameWorld = 0;
  private readonly controlHistory = new Uint8Array(256);
  private readonly svFrameHistory = new Float64Array(256);
  /** Entradas de `svFrameHistory` já preenchidas (o eco 0 antes do primeiro input não mede nada). */
  private readonly sentValid = new Uint8Array(256);
  private controls = 0;
  /** Momento da tecla da mudança de controles ainda não enviada / ainda não desenhada (OG-369). */
  private changeNotSent: number | null = null;
  private changeNotRendered: number | null = null;
  private hasFrame = false;
  /**
   * Relógio estimado do servidor: frame "aparente" = `now/100 + clockOffset`. Segue a chegada mais
   * cedo dos frames (envoltória) e cede devagar, para o jitter da rede não sacudir a extrapolação;
   * o original usa `fx.frame + (agora − frameReceiveTime)·10`.
   */
  private clockOffset = 0;
  /** Deslocamento visual por jogador (px), que decai até zero (suavização das correções). */
  private readonly smoothing = new Map<number, { x: number; y: number }>();
  private lastRender = 0;
  private lagSamples = 0;
  private offsetTotal = 0;
  private offsetCount = 0;
  /** Ajuste do próximo envio (ms), consumido por `nextSendDelay` (`netsendAdjustment`). */
  private sendAdjustment = 0;

  /** Bandeiras do mapa pedido que chegaram antes de ele carregar (aplicadas em `setMap`). */
  private readonly flagsBeforeMap = new Map<string, MessageOf<'flagUpdate'>>();
  /** Foguetes anunciados para um frame que ainda não chegou (o evento vem antes do frame). */
  private pendingRockets: { frame: number; create: () => void }[] = [];
  /** Geração de cada slot de foguete, para não repetir a explosão quando a extrapolação bate na parede. */
  private readonly rocketGen = new Uint32Array(MAX_ROCKETS);
  private readonly rocketExploded = new Uint32Array(MAX_ROCKETS);
  private extrapolated: WorldState | null = null;

  constructor(private readonly options: SessionOptions) {}

  /** Primeira mensagem da conexão. */
  static hello(ticket: string, client: string): AnyMessage {
    return message('hello', { protocol: PROTOCOL_VERSION, ticket, client });
  }

  private emit(event: SessionEvent): void {
    this.options.onEvent?.(event);
  }

  private physicsContext(world: WorldState): PhysicsContext {
    return { world, physics: this.settings.physics };
  }

  /** `ClientPhysicsCallbacks`: sem colisão com foguetes e sem efeitos de jogo; `fx` gera as explosões. */
  private callbacks(world: WorldState, effects: boolean): PhysicsCallbacks {
    const removeRocket = (rid: number, hitWall: boolean) => {
      const rk = world.rockets[rid];
      if (!rk || rk.owner === -1) return;
      // a extrapolação chega antes na parede: a explosão sai uma vez só, de quem chegar primeiro
      if (hitWall && (effects || world === this.extrapolated) && this.rocketExploded[rid] !== this.rocketGen[rid]) {
        this.rocketExploded[rid] = this.rocketGen[rid] as number;
        this.emit({ kind: 'rocketHitWall', pos: rk.pos.clone(), power: rk.power, team: rk.team });
      }
      rk.owner = -1;
    };
    return {
      collideToRockets: () => false,
      collidesToRockets: () => false,
      collidesToPlayers: () => true,
      gatherMovementDistance: () => false,
      // divergência: o jogador previsto troca de sala sem esperar o servidor (spec, item 3)
      allowRoomChange: () => true,
      addMovementDistance: () => {},
      playerScreenChange: () => {},
      rocketHitWall: (rid) => removeRocket(rid, true),
      rocketHitPlayer: () => false,
      playerHitWall: (pid) => this.emit({ kind: 'playerHitWall', pid }),
      playerHitPlayer: (pid1, pid2) => {
        this.emit({ kind: 'playerHitPlayer', pid1, pid2 });
        return { deaths: [false, false], bounceStrength1: 1, bounceStrength2: 1 };
      },
      rocketOutOfBounds: (rid) => removeRocket(rid, false),
      shouldApplyPhysicsToPlayer: (pid) => world.players[pid]?.dead === false,
    };
  }

  /** O mapa pedido terminou de carregar: monta o mundo e avisa o servidor (`client_ready`). */
  setMap(map: GameMap): void {
    const world = new WorldState(map, this.maxPlayers);
    this.world = world;
    for (const pid of this.present) this.ensurePlayer(pid);
    this.smoothing.clear();
    this.extrapolated = null;
    this.pendingRockets = [];
    this.onscreen.clear();
    this.skipped = true;
    for (const m of this.flagsBeforeMap.values()) this.onFlagUpdate(world, m);
    this.flagsBeforeMap.clear();
    if (this.options.holdReady?.()) this.readyHeld = true;
    else this.options.send([message('clientReady', {})]);
  }

  /** `client_ready` segurado pelo menu aberto (src/guiclient.cpp:2790-2795). */
  private readyHeld = false;

  /** O menu fechou: manda o `clientReady` segurado, se houver. */
  releaseReady(): void {
    if (!this.readyHeld) return;
    this.readyHeld = false;
    this.options.send([message('clientReady', {})]);
  }

  private setName(pid: number, name: string): void {
    this.plainNames.set(pid, name);
    this.names.set(pid, chatName(name, this.clanTags.get(pid)));
  }

  private ensurePlayer(pid: number): PlayerState | undefined {
    if (pid >= this.maxPlayers) return undefined;
    this.present.add(pid);
    const world = this.world;
    if (!world) return undefined;
    let p = world.players[pid];
    if (!p) {
      p = world.players[pid] = new PlayerState(pid, world.teamOf(pid));
      p.dead = true;
      p.stats.frags = this.frags.get(pid) ?? 0;
    }
    return p;
  }

  /** Mensagens do servidor, na ordem em que chegaram. */
  handle(messages: readonly AnyMessage[], now: number): void {
    this.lastPacketTime = now;
    for (const m of messages) this.handleOne(m, now);
  }

  private handleOne(m: AnyMessage, now: number): void {
    // avisa antes de tratar: quem sai ainda tem nome e frags (`player left the game with $2 frags`)
    if (m.type !== 'frame') this.emit({ kind: 'message', message: m });
    const world = this.world;
    switch (m.type) {
      case 'welcome':
        this.me = m.pid;
        this.maxPlayers = m.maxPlayers;
        this.teamScores[0] = m.redScore;
        this.teamScores[1] = m.blueScore;
        this.colors.set(m.pid, m.color);
        break;
      case 'playerInfo':
        this.colors.set(m.pid, m.color);
        this.playerInfo.set(m.pid, m);
        break;
      case 'stats':
        this.playerStats.set(m.stats.pid, { stats: m.stats, at: this.gameTime() });
        break;
      case 'movementShots':
        this.movementShots.set(m.pid, m.data);
        break;
      case 'teamMovementShots':
        this.teamMovementShots = m;
        break;
      case 'statsReady':
        this.statsReadyCount++;
        break;
      case 'teamStats':
        this.teamStats[m.team === 'red' ? 0 : 1] = m;
        break;
      case 'teamChange':
        this.onTeamChange(m);
        break;
      case 'scoreUpdate':
        this.teamScores[m.team === 'red' ? 0 : 1] = m.score;
        break;
      case 'weaponChange':
        this.weapon = m.level;
        break;
      case 'casualConfig':
        this.casualConfig = m;
        break;
      case 'powerupTimer':
        if (m.kind === 'power' || m.kind === 'turbo' || m.kind === 'shadow') this.powerupEnd[m.kind] = this.gameTime() + m.seconds;
        break;
      case 'mapTime':
        // vale a partir do frame que vem em seguida (na entrada, o mundo ainda nem existe)
        this.pendingMapTime = m;
        break;
      case 'timeEvent':
        if (m.kind === 'normalTimeOut' || m.kind === 'normalTimeOutSuddenDeath') this.extraTime = true;
        break;
      case 'gameOver':
        this.gameOver = { reason: m.reason, red: this.teamScores[0], blue: this.teamScores[1] };
        break;
      case 'startGame':
        // `data_start_game`: as estatísticas da partida anterior saem (as finais ficam no placar)
        this.movementShots.clear();
        this.teamMovementShots = null;
        this.gameOver = null;
        this.extraTime = false;
        break;
      case 'kill':
      case 'suicideEvent': {
        const p = this.world?.players[m.type === 'kill' ? m.target : m.pid];
        if (p) p.dead = true;
        break;
      }
      case 'spawn': {
        const p = this.world?.players[m.pid];
        if (p) p.dead = false;
        // a posição guardada é a da morte: até chegar a nova (frame ou minimapa) ele não aparece (OG-347)
        if (m.pid !== this.me) this.posUpdated.delete(m.pid);
        break;
      }
      case 'serverSettings':
        // o preset e as linhas de /set por cima (a tela F5 mostra as regras em vigor)
        if (PRESETS.some((p) => p.id === m.preset)) {
          this.preset = m.preset;
          this.settings = m.gamemod ? applyGamemod(presetSettings(m.preset), m.gamemod).settings : presetSettings(m.preset);
        }
        break;
      case 'mapList':
        this.mapList = m.maps;
        this.mapVoteCounts = m.maps.map((x) => x.votes);
        break;
      case 'mapVotes':
        this.mapVoteCounts = m.votes;
        break;
      case 'lobbyState':
        this.lobby = m;
        break;
      case 'pauseState':
        this.pause = m;
        break;
      case 'currentMap':
        this.currentMapIndex = m.mapIndex;
        break;
      case 'mapChange':
        // troca por voto também mostra o placar (`NEXTMAP_VOTE_EXIT`)
        if (m.reason === 'vote') this.gameOver = { reason: 'vote', red: this.teamScores[0], blue: this.teamScores[1] };
        this.currentMapIndex = m.mapIndex;
        this.mapRequest = { file: m.file, title: m.title, crc: m.crc, mapIndex: m.mapIndex };
        this.skipped = true;
        this.world = null; // o mundo antigo não vale mais; o novo nasce em `setMap`
        this.flagsBeforeMap.clear();
        this.options.onMapChange(this.mapRequest);
        break;
      case 'playersPresent':
        for (const pid of m.pids) this.ensurePlayer(pid);
        break;
      case 'playerJoined':
        this.clanTags.delete(m.pid);
        this.setName(m.pid, m.name);
        this.colors.set(m.pid, m.color);
        this.numbers.delete(m.pid);
        if (m.bot) this.bots.add(m.pid);
        else this.bots.delete(m.pid);
        this.ensurePlayer(m.pid);
        break;
      case 'playerName':
        this.setName(m.pid, m.name);
        break;
      case 'playerNumber':
        this.numbers.set(m.pid, m.number);
        this.numberStyles.set(m.pid, m.style);
        break;
      case 'teamIdentity':
        if (m.team === 0 || m.team === 1) {
          this.teamIdentity[m.team] = m.tag ? { tag: m.tag, name: m.name, color: m.color || null } : null;
          this.teamIdentityVersion++;
        }
        break;
      case 'teamEmblem': {
        const id = m.team === 0 || m.team === 1 ? this.teamIdentity[m.team] : null;
        const emblem = parseEmblem(m);
        if (id && emblem) {
          this.teamIdentity[m.team as 0 | 1] = { ...id, emblem, colors: { primary: m.primary, secondary: m.secondary } };
          this.teamIdentityVersion++;
        }
        break;
      }
      case 'playerClan':
        this.clanTags.set(m.pid, m.tag);
        this.setName(m.pid, this.plainNames.get(m.pid) ?? '');
        break;
      case 'playerLeft':
        if (this.names.has(m.pid)) this.pastNames.set(m.pid, this.names.get(m.pid)!);
        this.playerStats.delete(m.pid);
        this.movementShots.delete(m.pid);
        this.playerInfo.delete(m.pid);
        this.names.delete(m.pid);
        this.plainNames.delete(m.pid);
        this.bots.delete(m.pid);
        this.numbers.delete(m.pid);
        this.clanTags.delete(m.pid);
        this.present.delete(m.pid);
        this.posUpdated.delete(m.pid);
        this.pings.delete(m.pid);
        this.frags.delete(m.pid);
        if (world) world.players[m.pid] = undefined;
        this.onscreen.delete(m.pid);
        break;
      case 'frags': {
        this.frags.set(m.pid, m.frags);
        const p = this.ensurePlayer(m.pid);
        if (p) p.stats.frags = m.frags;
        break;
      }
      case 'frame':
        this.onFrame(m, now);
        break;
      case 'replayFrame':
        this.onReplayFrame(m);
        break;
      case 'flagUpdate':
        if (world) this.onFlagUpdate(world, m);
        else this.flagsBeforeMap.set(m.team, m);
        break;
      case 'rocketFire':
      case 'rocketVisible':
        this.onRocket(m);
        break;
      case 'rocketDelete': {
        const rk = world?.rockets[m.rocket];
        if (!rk || rk.owner === -1) break;
        if (m.target !== 255) {
          this.hitUntil.set(m.target, now + 300);
          this.emit({ kind: 'rocketHitPlayer', pos: new Position(rk.pos.roomX, rk.pos.roomY, m.x, m.y), target: m.target, team: rk.team });
        }
        rk.owner = -1;
        this.rocketExploded[m.rocket] = this.rocketGen[m.rocket] as number;
        break;
      }
      case 'powerupVisible': {
        const it = world?.items[m.id];
        if (!it) break;
        it.kind = PowerupKind[m.kind];
        it.pos = new Position(m.roomX, m.roomY, m.x, m.y);
        break;
      }
      case 'powerupPicked': {
        const it = world?.items[m.id];
        if (it) it.kind = PowerupKind.unused;
        break;
      }
      case 'deathbringer':
        if (world) world.explosions.push(new DeathbringerExplosion(m.frame, new Position(m.roomX, m.roomY, m.x, m.y), -1, m.team === 'red' ? 0 : 1));
        break;
      case 'waitingTime':
        this.respawnFrame = (world?.frame ?? 0) + m.frames;
        break;
      case 'worldReset':
        if (world) {
          for (const rk of world.rockets) rk.owner = -1;
          for (const it of world.items) it.kind = PowerupKind.unused;
          world.explosions = [];
          this.pendingRockets = [];
        }
        break;
      default:
        break;
    }
  }

  /** `data_team_change`: o jogador vai para outra vaga (ou troca de vaga com outro). */
  private onTeamChange(m: MessageOf<'teamChange'>): void {
    const { from, to } = m;
    const swap = m.swappedColor !== 255;
    const world = this.world;
    // o número e o estilo (OG-410/413) também mudam de lugar com o jogador
    const maps: Map<number, unknown>[] = [this.names, this.plainNames, this.clanTags, this.frags, this.colors, this.posUpdated, this.pings, this.hitUntil, this.numbers, this.numberStyles];
    for (const map of maps) {
      const a = map.get(from);
      const b = map.get(to);
      map.delete(from);
      map.delete(to);
      if (a !== undefined) map.set(to, a);
      if (swap && b !== undefined) map.set(from, b);
    }
    for (const set of [this.onscreen, this.bots]) {
      const onA = set.delete(from);
      const onB = set.delete(to);
      if (onA) set.add(to);
      if (swap && onB) set.add(from);
    }
    if (!swap) this.present.delete(from);
    this.present.add(to);
    if (world) {
      const pa = world.players[from];
      const pb = world.players[to];
      const rekey = (p: PlayerState | undefined, pid: number) => (p ? Object.assign(new PlayerState(pid, world.teamOf(pid)), p, { pid, team: world.teamOf(pid) }) : undefined);
      world.players[to] = rekey(pa, to);
      world.players[from] = swap ? rekey(pb, from) : undefined;
    }
    this.colors.set(to, m.color);
    if (swap) this.colors.set(from, m.swappedColor);
    if (this.me === from) this.me = to;
    else if (swap && this.me === to) this.me = from;
  }

  private onFlagUpdate(world: WorldState, m: MessageOf<'flagUpdate'>): void {
    const team = m.team === 'red' ? 0 : m.team === 'blue' ? 1 : 2;
    const old = world.flagsOf(team);
    const flags = m.flags.map((f, i) => {
      const pos = new Position(f.roomX, f.roomY, f.x, f.y);
      const prev = old[i];
      const flag = new FlagState(prev?.home ?? pos.clone(), pos);
      if (f.carried) {
        flag.status = 'carried';
        flag.carrier = f.carrier;
        if (prev && prev.status !== 'carried') this.emit({ kind: 'flagCarried', team });
      } else if (prev && !(prev.home.sameRoom(pos) && prev.home.x === pos.x && prev.home.y === pos.y)) {
        // fora da base: a hora da largada (para o contador de devolução) é quando a vimos cair
        flag.status = 'dropped';
        flag.dropTime = prev.status === 'dropped' ? prev.dropTime : world.frame / 10;
      } else if (prev && prev.status !== 'base') this.flagReturnTime.set(`${team}.${i}`, world.frame / 10);
      return flag;
    });
    if (m.team === 'wild') world.wildFlags = flags;
    else world.teams[m.team === 'red' ? 0 : 1].flags = flags;
  }

  private onRocket(m: MessageOf<'rocketFire'> | MessageOf<'rocketVisible'>): void {
    const world = this.world;
    if (!world) return;
    const rids = 'rockets' in m ? m.rockets : [m.rocket];
    const owner = 'owner' in m ? m.owner : -2;
    const team = 'owner' in m ? world.teamOf(m.owner) : m.team === 'red' ? 0 : 1;
    const pos = new Position(m.roomX, m.roomY, m.x, m.y);
    const create = () => {
      const w = this.world;
      if (!w || rids.some((rid) => rid >= MAX_ROCKETS)) return;
      // tiro do mapa anterior chegando depois da troca: a sala pode não existir no novo (OG-446)
      if (m.roomX >= w.map.width || m.roomY >= w.map.height) return;
      for (const rid of rids) this.rocketGen[rid] = (this.rocketGen[rid] as number) + 1;
      // `shootRockets(..., fx.frame − frameno, ...)`: nasce já avançado pelo atraso
      shootRocketFormation(this.physicsContext(w), rids, { owner, team, pos, power: m.power, dir: dirFromNet(m.gundir), frameAdvance: w.frame - m.frame }, this.callbacks(w, true));
      if (owner >= 0) this.emit({ kind: 'rocketFired', pos, power: m.power, owner });
    };
    // o tiro do frame F chega antes do frame F: espera o frame para nascer no mesmo ponto do servidor
    if (m.frame > world.frame) this.pendingRockets.push({ frame: m.frame, create });
    else create();
  }

  /** `process_live_frame_data`. */
  private onFrame(m: MessageOf<'frame'>, now: number): void {
    this.lastServerFrame = Math.max(this.lastServerFrame, m.frame);
    const world = this.world;
    if (!world) return;
    if (m.frame < world.frame) return; // atrasado
    this.stats.framesReceived++;

    // onde cada jogador estaria "agora" antes deste frame (para medir e suavizar a correção)
    const beforeDelta = this.options.headless ? null : this.timeDelta(now);
    const before = new Map<number, { pos: Position; dead: boolean }>();
    if (beforeDelta !== null)
      for (const p of this.extrapolateWith(beforeDelta)?.players ?? []) if (p) before.set(p.pid, { pos: p.pos.clone(), dead: p.dead });
    const advanced = m.frame - world.frame;

    // relógio do servidor: frame m.frame acabou de chegar; o "agora" do servidor é pelo menos isso
    const sample = m.frame - now / 100;
    // pausado (OG-260) o frame não anda: o relógio segue o servidor para não pular na retomada
    if (!this.hasFrame || this.paused || sample > this.clockOffset || this.clockOffset - sample > MAX_EXTRAPOLATION) this.clockOffset = sample;
    else this.clockOffset -= 0.002; // cede 0,2 ms por frame: acompanha um aumento de latência
    this.hasFrame = true;

    this.advanceWorld(world, m.frame);

    // atraso: do envio dos controles até o frame que os aplicou
    this.clFrameWorld = m.lastClientFrame;
    if (this.sentValid[this.clFrameWorld]) {
      const lag = Math.min(50, Math.max(0, m.frame - 0.5 - (this.svFrameHistory[this.clFrameWorld] as number)));
      this.stats.averageLag = this.lagSamples++ === 0 ? lag : this.stats.averageLag * 0.99 + lag * 0.01;
    }

    // sincronização do envio: o alvo é chegar no meio do frame do servidor
    this.stats.frameOffset = m.frameOffset / 256;
    this.offsetTotal += m.frameOffset / 256 - 0.5;
    if (++this.offsetCount === 10) {
      this.sendAdjustment = -(this.offsetTotal / 10) * 100;
      this.offsetTotal = 0;
      this.offsetCount = 0;
    }

    this.applyMapTime(m.frame);

    this.skipped = m.skipped;
    if (m.skipped) return;

    this.onscreen.clear();
    const self = m.self;
    const me = this.ensurePlayer(this.me);
    if (self && me) {
      // `oldRoom`: ao trocar de sala, esquece os power-ups das outras salas. Os da sala nova chegam
      // no mesmo pacote, antes do frame (OG-286), e ficam.
      if (me.pos.roomX !== self.roomX || me.pos.roomY !== self.roomY)
        for (const it of world.items) if (it.pos.roomX !== self.roomX || it.pos.roomY !== self.roomY) it.kind = PowerupKind.unused;
      me.pos = new Position(self.roomX, self.roomY, self.x, self.y);
      me.vel = new Vec(self.vx, self.vy);
      me.health = self.health;
      me.energy = self.energy;
    }
    const roomX = self?.roomX ?? me?.pos.roomX ?? 0;
    const roomY = self?.roomY ?? me?.pos.roomY ?? 0;
    for (const fp of m.players) {
      const p = this.ensurePlayer(fp.pid);
      if (!p) continue;
      this.onscreen.add(fp.pid);
      if (fp.pid !== this.me || !self) {
        p.pos = new Position(roomX, roomY, fp.x, fp.y);
        p.vel = new Vec(fp.vx, fp.vy);
      }
      p.dead = fp.dead;
      if (p.dead) p.vel = new Vec(0, 0); // morto não anda (OG-231)
      p.deathbringer = fp.deathbringer;
      p.deathbringerEnd = fp.deathbringerAffected ? Infinity : -Infinity;
      p.shield = fp.shield ? 1 : 0;
      p.turbo = fp.turbo;
      p.power = fp.power;
      p.controls = fp.controls;
      p.gundir = dirFromNet(fp.gundir);
      p.visibility = fp.visibility;
      if (fp.pid === this.me) {
        // perdeu o item (morte, descarte do pior): o tempo do HUD e a visão do shadow acabam (OG-288)
        if (!fp.turbo) this.powerupEnd.turbo = 0;
        if (!fp.power) this.powerupEnd.power = 0;
        if (fp.visibility === 255) this.powerupEnd.shadow = 0;
      }
      this.posUpdated.set(fp.pid, m.frame);
    }
    if (me) this.posUpdated.set(this.me, m.frame);
    for (const mm of m.minimap) this.minimapPosition(world, mm, m.frame);
    if (m.ping) this.pings.set(m.ping.pid, m.ping.ms);

    // mesma hora-alvo de antes (descontando os frames que chegaram): a diferença é só de simulação
    if (beforeDelta === null || beforeDelta - advanced < 0) return;
    const after = this.extrapolateWith(beforeDelta - advanced);
    for (const p of after?.players ?? []) {
      const old = p && before.get(p.pid);
      if (!p || !old || old.dead !== p.dead) continue;
      const d = delta(old.pos, p.pos, world.map);
      const dist = Math.hypot(d.x, d.y);
      if (p.pid === this.me && dist > CORRECTION_PX) this.stats.corrections++;
      if (dist > SMOOTHING_SNAP_PX) {
        this.smoothing.delete(p.pid);
        continue;
      }
      const off = this.smoothing.get(p.pid) ?? { x: 0, y: 0 };
      this.smoothing.set(p.pid, { x: off.x + d.x, y: off.y + d.y });
    }
  }

  /** Foguetes andam até o frame novo; explosões velhas saem; tiros anunciados para ele nascem. */
  private advanceWorld(world: WorldState, frame: number): void {
    const advanced = frame - world.frame;
    if (advanced > 0) rocketFrameAdvance(this.physicsContext(world), advanced, this.callbacks(world, true));
    world.frame = frame;
    world.time = frame / 10;
    world.explosions = world.explosions.filter((db) => !db.expired(world.frame));
    const ready = this.pendingRockets.filter((r) => r.frame <= world.frame);
    this.pendingRockets = this.pendingRockets.filter((r) => r.frame > world.frame);
    for (const r of ready) r.create();
  }

  private applyMapTime(frame: number): void {
    if (!this.pendingMapTime) return;
    const t = Math.trunc(frame / 10);
    this.mapStart = t - this.pendingMapTime.elapsed;
    this.mapEnd = this.pendingMapTime.left > 0 ? t + this.pendingMapTime.left : null;
    this.pendingMapTime = null;
  }

  /** Frame de replay (OG-091): espectador que vê todos os jogadores, cada um na sua sala. */
  private onReplayFrame(m: MessageOf<'replayFrame'>): void {
    this.lastServerFrame = Math.max(this.lastServerFrame, m.frame);
    const world = this.world;
    if (!world || m.frame < world.frame) return;
    this.stats.framesReceived++;
    this.advanceWorld(world, m.frame);
    this.applyMapTime(m.frame);
    this.hasFrame = true;
    this.skipped = false;
    this.onscreen.clear();
    for (const rp of m.players) {
      const p = this.ensurePlayer(rp.pid);
      if (!p) continue;
      this.onscreen.add(rp.pid);
      p.pos = new Position(rp.roomX, rp.roomY, rp.x, rp.y);
      p.vel = new Vec(rp.vx, rp.vy);
      p.dead = rp.dead;
      if (p.dead) p.vel = new Vec(0, 0);
      p.deathbringer = rp.deathbringer;
      p.deathbringerEnd = rp.deathbringerAffected ? Infinity : -Infinity;
      p.shield = rp.shield ? 1 : 0;
      p.turbo = rp.turbo;
      p.power = rp.power;
      p.controls = rp.controls;
      p.gundir = dirFromNet(rp.gundir);
      p.visibility = rp.visibility;
      this.posUpdated.set(rp.pid, m.frame);
    }
  }

  /** O último frame recebido andado `frames` à frente (replay: movimento suave entre os frames). */
  extrapolateBy(frames: number): WorldState | null {
    return this.extrapolateWith(frames);
  }

  /** `readMinimapPlayerPosition`: centro da célula do minimapa (`⌊255/w⌋` células por sala). */
  private minimapPosition(world: WorldState, mm: { pid: number; x: number; y: number }, frame: number): void {
    if (mm.pid === this.me || this.onscreen.has(mm.pid)) return;
    const p = this.ensurePlayer(mm.pid);
    if (!p) return;
    const xmul = Math.trunc(255 / world.map.width);
    const ymul = Math.trunc(255 / world.map.height);
    const rx = Math.trunc(mm.x / xmul);
    const ry = Math.trunc(mm.y / ymul);
    if (rx >= world.map.width || ry >= world.map.height) return;
    p.pos = new Position(rx, ry, ((mm.x % xmul) + 0.5) * (ROOM_WIDTH / xmul), ((mm.y % ymul) + 0.5) * (ROOM_HEIGHT / ymul));
    p.vel = new Vec(0, 0);
    p.dead = false;
    this.posUpdated.set(mm.pid, frame);
  }

  /** Tempo do jogo (s) do último frame. */
  gameTime(): number {
    return (this.world?.frame ?? 0) / 10;
  }

  // ---------------------------------------------------------------- envio

  /**
   * Controles atuais (bits de `CONTROL`). Toda mudança que ainda pega o tick do envio anterior é
   * reenviada na hora (D-71: sem o limite de um reenvio por frame do original); as outras saem no
   * próximo envio, que chega a tempo do tick seguinte. A predição usa o controle atual já no quadro
   * seguinte em ambos os casos (`extrapolateWith`).
   */
  setControls(controls: number, now: number, changedAt = now): void {
    const c = controls & 0x3f;
    if (c === this.controls) return;
    this.controls = c;
    if (this.changeNotSent === null) this.changeNotSent = changedAt;
    this.changeNotRendered = changedAt;
    // ainda chega no mesmo frame do servidor que o envio anterior? então corrige esse envio (`send_frame(false)`)
    if (this.world && this.serverFrameNow(now) < (this.svFrameHistory[this.clFrameSent] as number) + 0.5) {
      this.controlHistory[this.clFrameSent] = c;
      this.options.send([message('input', { clientFrame: this.clFrameSent, controls: c, gundir: 0 })]);
      this.controlsSent(now);
    }
  }

  /** A mensagem com os controles atuais saiu: mede desde a tecla (OG-369). */
  private controlsSent(now: number): void {
    if (this.changeNotSent === null) return;
    const ms = now - this.changeNotSent;
    this.changeNotSent = null;
    if (ms >= 0 && ms < LATENCY_SAMPLE_MAX_MS) pushSample(this.inputLatency.send, ms);
  }

  /** Frame do servidor "aparente" agora (no original, `fx.frame + (agora − frameReceiveTime)·10`). */
  private serverFrameNow(now: number): number {
    return this.hasFrame ? Math.max(this.world?.frame ?? 0, now / 100 + this.clockOffset) : (this.world?.frame ?? 0);
  }

  /**
   * Envio de um frame (chamado pelo timer de 10 Hz). Devolve o atraso até o próximo envio (ms),
   * já com o ajuste de sincronização (`nextSend += .1 + netsendAdjustment`).
   */
  sendFrame(now: number): number {
    this.clFrameSent = u8(this.clFrameSent + 1);
    this.controlHistory[this.clFrameSent] = this.controls;
    this.svFrameHistory[this.clFrameSent] = this.serverFrameNow(now);
    // antes do primeiro frame o relógio do servidor é desconhecido: esse envio não mede atraso
    this.sentValid[this.clFrameSent] = this.hasFrame ? 1 : 0;
    this.options.send([message('input', { clientFrame: this.clFrameSent, controls: this.controls, gundir: 0 })]);
    this.controlsSent(now);
    const delay = 100 + this.sendAdjustment;
    this.sendAdjustment = 0;
    return delay;
  }

  /** Eventos do jogador (tiro, largar bandeira, suicídio...). */
  send(...messages: AnyMessage[]): void {
    this.options.send(messages);
  }

  // ---------------------------------------------------------------- extrapolação

  /** Frames a extrapolar a partir de `fx` (`timeDelta` do original, antes de consumir o histórico). */
  private timeDelta(now: number): number | null {
    if (!this.world || this.skipped || !this.hasFrame) return null;
    if (this.paused) return 0; // mundo parado: desenha o último frame como veio
    const elapsed = this.serverFrameNow(now) - this.world.frame;
    if (!this.prediction.enabled) return elapsed;
    const lagWanted = 2 * (1 - Math.min(10, Math.max(0, this.prediction.amount)) / 10);
    return Math.max(0, this.stats.averageLag - lagWanted) + elapsed;
  }

  /**
   * Mundo para desenhar agora (`fd`): cópia do último frame com todos andando até `now` e, com a
   * predição, o próprio jogador com os controles ainda não confirmados. null sem mundo ou com o
   * frame pulado (carregando, placar).
   */
  extrapolate(now: number, smooth = true): WorldState | null {
    const td = this.timeDelta(now);
    if (td === null) return null;
    const fd = this.extrapolateWith(td);
    // tecla→tela (OG-369): o primeiro desenho em que a predição já usa os controles atuais
    const me = fd?.players[this.me];
    if (this.changeNotRendered !== null && this.prediction.enabled && me && !me.dead && me.controls === this.controls) {
      const ms = now - this.changeNotRendered;
      this.changeNotRendered = null;
      if (ms >= 0 && ms < LATENCY_SAMPLE_MAX_MS) pushSample(this.inputLatency.render, ms);
    }
    if (!fd || !smooth) return fd;
    // correções recentes aparecem aos poucos (divergência: o original troca de posição de uma vez)
    const decay = Math.pow(0.5, Math.max(0, now - this.lastRender) / SMOOTHING_HALF_LIFE_MS);
    this.lastRender = now;
    for (const [pid, off] of this.smoothing) {
      off.x *= decay;
      off.y *= decay;
      const p = fd.players[pid];
      // o corpo fica onde o jogador morreu: a correção que sobrava não o arrasta (OG-231)
      if (p?.dead || (Math.abs(off.x) < 0.05 && Math.abs(off.y) < 0.05)) this.smoothing.delete(pid);
      else if (p) p.pos = offsetPosition(p.pos, off.x, off.y, fd.map);
    }
    return fd;
  }

  /** `ClientWorld::extrapolate` + a escolha de controles de `guiclient.cpp:2860-2896`. */
  private extrapolateWith(timeDelta: number): WorldState | null {
    const fx = this.world;
    if (!fx) return null;
    let fd = this.extrapolated;
    if (fd?.map !== fx.map) fd = this.extrapolated = new WorldState(fx.map, fx.maxPlayers);
    fd.frame = fx.frame;
    fd.time = fx.time;
    fd.teams[0].flags = fx.teams[0].flags;
    fd.teams[1].flags = fx.teams[1].flags;
    fd.wildFlags = fx.wildFlags;
    fd.explosions = fx.explosions;
    for (let i = 0; i < fx.maxPlayers; i++) {
      const p = fx.players[i];
      fd.players[i] = p && (this.onscreen.has(i) || i === this.me) ? clonePlayer(p) : undefined;
    }
    fx.rockets.forEach((rk, i) => {
      const dst = fd.rockets[i]!;
      dst.owner = rk.owner;
      if (rk.owner === -1) return;
      dst.team = rk.team;
      dst.power = rk.power;
      dst.pos = rk.pos.clone();
      dst.vel = rk.vel;
      dst.direction = rk.direction;
    });
    fx.items.forEach((it, i) => {
      const dst = fd.items[i]!;
      dst.kind = it.kind;
      dst.pos = it.pos;
    });

    const me = fd.players[this.me];
    let first = this.clFrameWorld;
    let last = this.clFrameWorld;
    let td = timeDelta;
    if (this.prediction.enabled && me && !this.paused) {
      if (this.clFrameSent !== this.clFrameWorld) {
        first = last = u8(this.clFrameWorld + 1);
        while (last !== this.clFrameSent && td > 1) {
          last = u8(last + 1);
          td -= 1;
        }
      }
      if (!me.dead) {
        // direção da arma: a última direção sem strafe ainda não confirmada
        for (let cf = last; cf !== this.clFrameWorld; cf = u8(cf - 1)) {
          const c = this.controlHistory[cf] as number;
          if (isStrafe(c)) continue;
          const d = controlDirection(c);
          if (d !== -1) {
            me.gundir = d;
            break;
          }
        }
      }
    }
    td = Math.min(td, MAX_EXTRAPOLATION);

    const ctx = this.physicsContext(fd);
    const cb = this.callbacks(fd, false);
    for (let cf = first; cf !== last; cf = u8(cf + 1)) {
      if (me) me.controls = this.controlHistory[cf] as number;
      applyPhysics(ctx, cb, PLAYER_RADIUS, 1);
      fd.frame++;
    }
    if (me) me.controls = this.controlHistory[last] as number;
    // divergência: frames inteiros e só a sobra fracionária (o original anda até 3 frames num passo
    // só, e a física de um passo de 1,5 frame não é a de 1 + 0,5: a posição pularia a cada frame)
    for (; td > 1; td -= 1) {
      applyPhysics(ctx, cb, PLAYER_RADIUS, 1);
      fd.frame++;
      // o tick do último envio usa os controles dele; os seguintes, os atuais (D-71), que saem no
      // próximo envio: prever a mudança antes disso desenharia o que o servidor não fará
      if (me && this.prediction.enabled && !this.paused && last === this.clFrameSent) me.controls = this.controls;
    }
    applyPhysics(ctx, cb, PLAYER_RADIUS, td);
    fd.frame += td;
    fd.time = fd.frame / 10;
    return fd;
  }

  /** Jogo Ranked pausado ou contando para retomar (OG-260): o servidor não anda o mundo. */
  get paused(): boolean {
    return this.pause !== null && this.pause.phase !== 'none';
  }

  /** Frames extrapolados no último `extrapolate` (para o tempo das animações). */
  get renderFrame(): number {
    return this.extrapolated?.frame ?? this.world?.frame ?? 0;
  }

  /** Bandeira que o jogador carrega (para a interface). */
  carriedFlag(pid: number): CarriedFlag {
    const world = this.world;
    if (!world) return CarriedFlag.None;
    const team = world.teamOf(pid);
    if (world.teams[team].flags.some((f) => f.carrier === pid)) return CarriedFlag.Own;
    if (world.teams[1 - team as 0 | 1].flags.some((f) => f.carrier === pid)) return CarriedFlag.Enemy;
    return world.wildFlags.some((f) => f.carrier === pid) ? CarriedFlag.Wild : CarriedFlag.None;
  }
}

/** Vetor de `b` até `a` no mapa toroidal (px). */
export function delta(a: Position, b: Position, map: GameMap): { x: number; y: number } {
  const w = map.width * ROOM_WIDTH;
  const h = map.height * ROOM_HEIGHT;
  let x = (a.roomX - b.roomX) * ROOM_WIDTH + a.x - b.x;
  let y = (a.roomY - b.roomY) * ROOM_HEIGHT + a.y - b.y;
  x -= Math.round(x / w) * w;
  y -= Math.round(y / h) * h;
  return { x, y };
}

/** Posição deslocada, trocando de sala se passar da borda. */
export function offsetPosition(p: Position, dx: number, dy: number, map: GameMap): Position {
  const tx = p.roomX * ROOM_WIDTH + p.x + dx;
  const ty = p.roomY * ROOM_HEIGHT + p.y + dy;
  const rx = Math.floor(tx / ROOM_WIDTH);
  const ry = Math.floor(ty / ROOM_HEIGHT);
  const wrap = (v: number, n: number) => ((v % n) + n) % n;
  return new Position(wrap(rx, map.width), wrap(ry, map.height), tx - rx * ROOM_WIDTH, ty - ry * ROOM_HEIGHT);
}
