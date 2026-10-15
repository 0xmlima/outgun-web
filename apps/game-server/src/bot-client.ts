// SPDX-License-Identifier: GPL-2.0-or-later
// Cliente virtual de um bot (OG-053): o `Robot` do original menos a thread. Recebe da sala os mesmos
// bytes que um jogador humano, com o atraso de `bot_ping` (`ServerClientLocalConnection`), monta a
// visão do jogo com o `ClientSession` do netcode, decide com a IA de @outgun/bots e devolve à sala
// `input` e `fire` como um cliente (RN-BOT-02). Spec: plan/specs/bots-ia.md.
import { acquireAreaMap, BotPlayer, botSkill, BotView, releaseAreaMap, Robot, type AreaMap, type BotFlagRules, type BotSkill } from '@outgun/bots';
import { ClientSession } from '@outgun/netcode';
import { decodeFrame, message, type AnyMessage, type MessageOf } from '@outgun/protocol';
import type { PhysicsSettings } from '@outgun/settings';
import type { GameMap, Rng, WorldCoords } from '@outgun/sim';
import type { Connection } from './room.js';

/** O que o bot precisa da sala. */
export interface BotHost {
  /** Frame atual do servidor. */
  readonly frame: number;
  /** `bot_ping` em ms. */
  botPing(): number;
  /** Mapa da rotação pelo nome do arquivo (o bot "carrega" o mesmo mapa do servidor). */
  mapByFile(file: string): GameMap | undefined;
  /** Mensagens do bot para a sala (como se chegassem pela rede). */
  deliver(pid: number, messages: AnyMessage[]): void;
}

const DEFAULT_RULES: BotFlagRules = {
  carryOwnTeamFlag: false,
  captureAwayFromBase: false,
  lockTeamFlags: false,
  lockWildFlags: false,
  captureOnTeamFlags: true,
  captureOnWildFlags: false,
  seeMinimapPlayerProperties: 0,
};

/** `max_run_speed` do cliente: recalculado com as settings recebidas (`calc_max_run_speed`). */
function clientPhysics(p: PhysicsSettings): PhysicsSettings {
  return { ...p, maxRunSpeed: (p.runMul * p.acceleration - p.friction) / p.drag };
}

/**
 * Pacotes já decodificados: o broadcast da sala é o mesmo buffer para todos os bots, então decodifica
 * uma vez só (as mensagens são só lidas).
 */
const decoded = new WeakMap<Uint8Array, AnyMessage[] | null>();

function decodeShared(data: Uint8Array): AnyMessage[] | null {
  let messages = decoded.get(data);
  if (messages === undefined) {
    const r = decodeFrame(data, 's2c');
    messages = r.ok ? r.messages : null;
    decoded.set(data, messages);
  }
  return messages;
}

export class BotClient implements Connection {
  /** pid na sala (muda na troca de time; a sala avisa por `moved`). */
  private pid = -1;
  private readonly session: ClientSession;
  /** Pacotes a entregar: frame do servidor em que foram enviados e os bytes. */
  private readonly inbox: { frame: number; data: Uint8Array }[] = [];
  private view: BotView | null = null;
  private robot: Robot | null = null;
  private areaMap: AreaMap | null = null;
  private rules: BotFlagRules = { ...DEFAULT_RULES };
  /** Bandeiras removidas pelo servidor (lista vazia em `flagUpdate`): somem das bases do cliente. */
  private readonly removedFlags = [false, false, false];
  /** Último frame do mundo recebido e o último decidido (`botReactedFrame`). */
  private worldFrame = -1;
  /** Frame do mundo da última decisão (`botReactedFrame`). */
  reactedFrame = -1;
  /** `clFrameSent`, `clFrameWorld` e `controlHistory` do cliente. */
  private clFrameSent = 0;
  private clFrameWorld = 0;
  private readonly controlHistory = new Uint8Array(256);
  private fire = false;
  private gunDir = -1;
  private closed = false;
  /** Custo (ms) das decisões e do bot inteiro (receber + decidir), para métricas. */
  decisionMs = 0;
  decisions = 0;
  stepMs = 0;

  constructor(
    private readonly host: BotHost,
    private readonly rng: Rng,
    private readonly clock: () => number = () => performance.now(),
    /** Nível de dificuldade (OG-266); sem ele, o de referência (Casual). */
    public skill: BotSkill = botSkill(),
  ) {
    this.session = new ClientSession({
      send: (messages) => this.toServer(messages),
      onMapChange: (req) => {
        const map = this.host.mapByFile(req.file);
        if (map) this.session.setMap(map);
      },
      headless: true,
    });
    this.session.prediction = { enabled: false, amount: 0 };
  }

  /** A sala aceitou o bot neste pid. */
  attach(pid: number): void {
    this.pid = pid;
    // `client_connected`: o primeiro frame do cliente vai vazio
    this.sendControls(0);
  }

  // ---------------------------------------------------------------- Connection

  send(data: Uint8Array): void {
    if (!this.closed) this.inbox.push({ frame: this.host.frame, data });
  }

  close(): void {
    this.closed = true;
    this.inbox.length = 0;
    this.dropMap();
  }

  /** pid na sala (−1 antes do `attach`). */
  get playerId(): number {
    return this.pid;
  }

  moved(pid: number): void {
    this.pid = pid;
  }

  // ---------------------------------------------------------------- laço

  /** Chamado pela sala no fim de cada frame (`bot_loop`): recebe o que chegou e decide uma vez por frame novo. */
  step(): void {
    if (this.closed || this.pid < 0) return;
    const t0 = this.clock();
    const delayFrames = Math.max(0, Math.round(this.host.botPing() / 100) + this.skill.reactionFrames);
    while (this.inbox.length > 0 && this.inbox[0]!.frame + delayFrames <= this.host.frame) {
      const messages = decodeShared(this.inbox.shift()!.data);
      if (messages) this.receive(messages);
    }
    // nível baixo decide a cada N frames (OG-266); o de referência decide em todo frame novo
    const due = this.skill.decideEvery <= 1 || this.reactedFrame < 0 || Math.abs(this.worldFrame - this.reactedFrame) >= this.skill.decideEvery;
    if (this.worldFrame !== this.reactedFrame && this.worldFrame >= 0 && due) {
      this.reactedFrame = this.worldFrame;
      const t1 = this.clock();
      this.decide();
      this.decisionMs += this.clock() - t1;
      this.decisions++;
    }
    this.stepMs += this.clock() - t0;
  }

  private receive(messages: AnyMessage[]): void {
    const now = this.host.frame * 100;
    for (const m of messages) {
      switch (m.type) {
        case 'mapChange':
          this.dropMap();
          this.removedFlags.fill(false);
          break;
        case 'flagUpdate': {
          const team = m.team === 'red' ? 0 : m.team === 'blue' ? 1 : 2;
          this.removedFlags[team] = m.flags.length === 0;
          break;
        }
        case 'flagModes':
          this.rules = {
            carryOwnTeamFlag: m.carryOwnTeamFlag,
            captureAwayFromBase: m.captureAwayFromBase,
            lockTeamFlags: m.lockTeamFlags,
            lockWildFlags: m.lockWildFlags,
            captureOnTeamFlags: m.captureOnTeamFlags,
            captureOnWildFlags: m.captureOnWildFlags,
            seeMinimapPlayerProperties: m.seeMinimapProperties,
          };
          break;
        case 'teamChange':
          this.forgetPlayers(m.from, m.to);
          break;
        case 'playerLeft':
          this.forgetPlayers(m.pid);
          break;
        case 'frame':
          if (m.frame > this.worldFrame) this.worldFrame = m.frame;
          this.clFrameWorld = m.lastClientFrame;
          break;
        default:
          break;
      }
      this.session.handle([m], now);
      if (m.type === 'text' && m.kind === 'team') this.teamMessage(m);
    }
  }

  /** Vagas que mudaram de dono: o cliente esquece o que sabia delas (`ClientPlayer::clear`). */
  private forgetPlayers(...pids: number[]): void {
    for (const pid of pids) if (this.view) this.view.players[pid] = this.freshPlayer(pid);
  }

  private freshPlayer(pid: number): BotPlayer {
    return new BotPlayer(pid, this.view!.world.teamOf(pid));
  }

  private dropMap(): void {
    if (this.areaMap) releaseAreaMap(this.areaMap);
    this.areaMap = null;
    this.view = null;
    this.robot = null;
  }

  /** Monta (ou atualiza) a visão do bot a partir do `ClientSession` (`fx`). */
  private syncView(): BotView | null {
    const s = this.session;
    const world = s.world;
    if (!world) return null;
    if (!this.view || this.view.world !== world) {
      this.dropMap();
      this.areaMap = acquireAreaMap(world.map);
      // foguetes, power-ups, bandeiras e explosões são lidos direto do mundo recebido
      this.view = new BotView(world.map, s.maxPlayers, clientPhysics(s.settings.physics), this.rules, world);
      this.robot = new Robot(this.view, this.areaMap, s.me, this.rng);
      this.robot.botPrevFire = this.fire;
      this.robot.gunDir = this.gunDir;
    }
    const view = this.view;
    view.frame = world.frame;
    view.physics = clientPhysics(s.settings.physics);
    view.rules = this.rules;
    const bases = (t: number): WorldCoords[] => (this.removedFlags[t] ? [] : t === 2 ? [...world.map.wildFlags] : [...world.map.teams[t as 0 | 1].flags]);
    view.bases = [bases(0), bases(1), bases(2)];
    for (let pid = 0; pid < view.maxPlayers; ++pid) {
      const src = world.players[pid];
      const bp = view.players[pid]!;
      const present = s.present.has(pid) && src !== undefined;
      if (!present) {
        if (bp.used) view.players[pid] = this.freshPlayer(pid);
        continue;
      }
      bp.used = true;
      bp.name = s.names.get(pid) ?? '';
      bp.team = world.teamOf(pid);
      bp.dead = src.dead;
      bp.onscreen = s.onscreen.has(pid);
      const updated = s.posUpdated.get(pid);
      // só posições novas: as antigas (ou adivinhadas pelo bot) ficam como estão
      if (updated !== undefined && updated === world.frame && bp.posUpdated !== updated) {
        bp.setPosition(src.pos.roomX, src.pos.roomY, src.pos.x, src.pos.y, updated, pid !== s.me && !bp.onscreen);
        bp.vel = src.vel;
      }
      if (pid === s.me) {
        bp.vel = src.vel;
        bp.weapon = s.weapon;
        bp.shadowTime = s.powerupEnd.shadow;
      }
      bp.controls = src.controls;
      bp.gundir = src.gundir;
      bp.accelerationMode = src.accelerationMode;
      bp.deathbringer = src.deathbringer;
      bp.deathbringerAffected = src.deathbringerEnd === Infinity;
      bp.turbo = src.turbo;
    }
    return view;
  }

  /** `RobotMain` + `bot_send_frame`. */
  private decide(): void {
    const s = this.session;
    const view = this.syncView();
    const robot = this.robot;
    const hidden = !view || !robot || s.skipped || s.gameOver !== null || s.me < 0 || s.me >= s.maxPlayers;
    let controls = 0;
    let fire = false;
    if (view && robot) {
      robot.me = s.me;
      robot.skill = this.skill;
      const pending = (this.clFrameSent - this.clFrameWorld + 256) % 256;
      const history: number[] = [];
      if (pending === 0) history.push(this.controlHistory[this.clFrameSent]!);
      else for (let i = 1; i <= pending; ++i) history.push(this.controlHistory[(this.clFrameWorld + i) & 255]!);
      const d = robot.decide(hidden, history, pending);
      controls = d.controls;
      fire = d.fire;
      this.gunDir = robot.gunDir;
    }
    if (fire !== this.fire) {
      this.fire = fire;
      this.toServer([message('fire', { on: fire })]);
    }
    this.sendControls(controls);
  }

  private sendControls(controls: number): void {
    this.clFrameSent = (this.clFrameSent + 1) & 255;
    this.controlHistory[this.clFrameSent] = controls;
    const freeTurning = this.session.settings.physics.allowFreeTurning && this.gunDir >= 0;
    const gundir = freeTurning ? Math.round(this.gunDir * 256) % 2048 : 0;
    this.toServer([message('input', { clientFrame: this.clFrameSent, controls, gundir })]);
  }

  private toServer(messages: AnyMessage[]): void {
    if (this.closed || this.pid < 0) return;
    this.host.deliver(this.pid, messages);
  }

  /**
   * Preferência anunciada no chat de time ("d"/"def"/"defending", "a"/"att"/"attacking"); o primeiro
   * bot do time confirma (`net_text_message`).
   */
  private teamMessage(m: MessageOf<'text'>): void {
    const view = this.view;
    const s = this.session;
    if (!view || s.me < 0) return;
    const colon = m.text.indexOf(': ');
    if (colon === -1 || colon >= m.text.length - 2) return;
    const senderName = m.text.slice(0, colon);
    const myTeam = view.world.teamOf(s.me);
    const sender = view.players.find((p) => p.used && p.team === myTeam && p.name === senderName);
    if (!sender) return;
    const msg = m.text.slice(colon + 2);
    let description: string;
    if (msg === 'd' || msg === 'D' || msg === 'def' || msg === 'defending') {
      sender.defending = true;
      sender.defendingAfterDeath = msg !== 'd';
      description = `${sender.name} prefers defending${sender.defendingAfterDeath ? '' : ' until dead, then attacking'}`;
    } else if (msg === 'a' || msg === 'A' || msg === 'att' || msg === 'attacking') {
      sender.defending = false;
      sender.defendingAfterDeath = msg === 'a';
      description = `${sender.name} prefers attacking${sender.defendingAfterDeath ? ' until dead, then defending' : ''}`;
    } else return;
    const firstBot = view.players.find((p) => p.used && p.team === myTeam && p.name.startsWith('BOT '));
    if (!firstBot || firstBot.pid === s.me) this.toServer([message('chat', { text: `.Roger - ${description}`, teamOnly: true })]);
  }
}

