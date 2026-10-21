// SPDX-License-Identifier: GPL-2.0-or-later
// Estado do HUD da partida no servidor: junta a sessão (`@outgun/netcode`), o mundo extrapolado, as
// mensagens e o chat (`calculateVisibilities`, `ConstDisappearedFlagIterator`, destaque ao nascer;
// src/guiclient.cpp:378-389, 3735-3858).
import type { ClientSession } from '@outgun/netcode';
import { message } from '@outgun/protocol';
import { CarriedFlag, type WorldCoords, type WorldState } from '@outgun/sim';
import type { RoomLayout } from '../render/layout.js';
import { chatPrompt, MessageFeed, type FeedContext, type FeedFacts, type Translate } from './feed.js';
import type { HudFlag, HudPlayer, HudState } from './hud-renderer.js';
import { chatLines, type ScreenLayout } from './screen-layout.js';
import { DEFAULT_GRAPHICS, minimapFade, showNeighborMarkers, type GraphicsOptions } from '../graphics-options.js';
import { IS_MAC } from '../input/shortcuts.js';

const coords = (p: { roomX: number; roomY: number; x: number; y: number }): WorldCoords => ({ room: { x: p.roomX, y: p.roomY }, x: p.x, y: p.y });

/** Bandeira de quem saiu da vista fica marcada por 30 s. */
const OLD_FLAG_FRAMES = 300;
/** Duração do destaque ao nascer (s). */
const HIGHLIGHT_TIME = 0.5;
/** Tamanho máximo do chat (RN-CHT-01). */
export const MAX_CHAT_LENGTH = 200;

/**
 * Ordem do placar como o original (`compare_players` com `stable_sort`, src/world.cpp:64 e
 * src/clientbase.cpp:668, OG-317): time vermelho antes do azul, mais frags primeiro e, no empate, a
 * ordem anterior (os nomes não trocam de lugar a cada quadro). Quem acabou de entrar vai para o fim
 * do grupo de mesmo placar, por `pid`.
 */
export function scoreboardOrder<T extends { pid: number; team: number; frags: number }>(players: readonly T[], previous: readonly number[]): T[] {
  const rank = new Map(previous.map((pid, i) => [pid, i]));
  const before = (p: T) => rank.get(p.pid) ?? previous.length + p.pid;
  return [...players].sort((a, b) => a.team - b.team || b.frags - a.frags || before(a) - before(b));
}

export class OnlineHud {
  readonly feed: MessageFeed;
  /** Texto sendo digitado (`talkbuffer`). */
  chat = '';
  /** Insert: todas as mensagens. */
  showAll = false;
  /** Pediu troca de time (Ctrl+End); a troca feita zera o pedido. */
  wantChangeTeams = false;
  /** Votou para sair do mapa (F8); "atrasado" = não vale sem voto num mapa específico. */
  wantMapExit = false;
  mapExitDelayed = false;
  /** Voto num mapa da lista F2 (−1 = nenhum, `map_vote`). */
  mapVote = -1;
  /** Meu voto do bot substituto (OG-264) e de quem é a vaga votada (o voto vale para um voto só). */
  private subVote: { pid: number; bot: boolean } | null = null;
  /** Onde cada bandeira carregada foi vista por último (portador na tela). */
  private readonly flagSeen = new Map<string, WorldCoords>();
  /** Ordem do placar no quadro anterior (desempate estável, OG-317). */
  private scoreOrder: number[] = [];
  private deadAfterHighlighted = true;
  private spawnTime = -10;

  constructor(
    private readonly session: ClientSession,
    private readonly t: Translate,
  ) {
    this.feed = new MessageFeed(t);
  }

  private context(): FeedContext {
    const s = this.session;
    const w = s.settings.world;
    return {
      me: s.me,
      teamOf: (pid) => (s.maxPlayers ? Math.trunc(pid / (s.maxPlayers / 2)) : 0),
      name: (pid) => s.names.get(pid) ?? '',
      frags: (pid) => s.frags.get(pid) ?? 0,
      time: s.lastServerFrame >= 0 ? s.lastServerFrame / 10 : -1,
      captureLimit: w.captureLimit,
      timeLimit: Math.trunc(w.timeLimit / 600),
      mapCount: s.mapList.length,
    };
  }

  /** Posso votar no voto do bot substituto aberto agora (sou do time desfalcado). */
  canVote(): boolean {
    const p = this.session.pause;
    return p !== null && p.phase === 'paused' && p.reason === 'vote' && this.context().teamOf(this.session.me) === p.team;
  }

  /** Voto do bot substituto (OG-264): manda e lembra para destacar a opção; null se não há voto para mim. */
  vote(bot: boolean): ReturnType<typeof message<'substituteVote'>> | null {
    const p = this.session.pause;
    if (!p || !this.canVote()) return null;
    this.subVote = { pid: p.by, bot };
    return message('substituteVote', { bot });
  }

  /** Overlay da pausa do Ranked (OG-264, RN-UI-05): textos prontos; null sem pausa. */
  private pauseOverlay(): NonNullable<HudState['pause']> | null {
    const p = this.session.pause;
    if (!p || p.phase === 'none') return null;
    const t = this.t;
    const ctx = this.context();
    const team = (n: number) => t(n === 0 ? 'Red' : 'Blue');
    const name = p.by !== 255 ? ctx.name(p.by) : '';
    const footer = t('Pause left - Red: $1 s ($2) Blue: $3 s ($4)', String(p.redSeconds), String(p.redRequests), String(p.blueSeconds), String(p.blueRequests));
    if (p.phase === 'resuming') return { title: t('Resuming in $1', String(p.seconds)), detail: '', options: null, footer, hint: null };
    if (p.reason === 'team') {
      const mine = ctx.teamOf(this.session.me) === p.team;
      return { title: t('PAUSED'), detail: t('Pause requested by $1 ($2) - $3 s left', name, team(p.team), String(p.seconds)), options: null, footer, hint: mine ? t('P resumes') : null };
    }
    if (p.reason === 'drop') return { title: t('$1 lost connection', name), detail: t('Waiting for reconnection: $1 s', String(p.seconds)), options: null, footer, hint: null };
    if (!this.canVote()) return { title: t('$1 left the game', name), detail: t('$1 team is voting: $2 s', team(p.team), String(p.seconds)), options: null, footer, hint: null };
    const mine = this.subVote?.pid === p.by ? this.subVote.bot : null;
    return {
      title: t('$1 left the game', name),
      detail: t('Team vote: $1 s', String(p.seconds)),
      options: [
        { label: t('[1] Bot in place ($1)', String(p.votesBot)), chosen: mine === true, bot: true },
        { label: t('[2] Play one short ($1)', String(p.votesShort)), chosen: mine === false, bot: false },
      ],
      footer,
      hint: null,
    };
  }

  /** Mensagem do servidor (chamar antes de a sessão tratá-la, para nomes de quem sai). */
  onMessage(m: Parameters<MessageFeed['onMessage']>[0]): FeedFacts {
    if (m.type === 'teamChange' && (m.from === this.session.me || m.to === this.session.me)) this.wantChangeTeams = false;
    if (m.type === 'mapChange') {
      this.wantMapExit = this.mapExitDelayed = false; // `netMapChange`
      if (this.mapVote === m.mapIndex) this.mapVote = -1; // o servidor também zera o voto no mapa escolhido
    }
    if (m.type === 'gameOver') this.feed.gameOverScores(this.session.teamScores[0], this.session.teamScores[1], this.context());
    const facts = this.feed.onMessage(m, this.context());
    if (facts.voteNoEffect) this.mapExitDelayed = true;
    return facts;
  }

  /** Mensagens rápidas (Alt+1..0) e filtros do feed (OG-068). */
  private quick: { enabled: boolean; immediate: boolean; messages: readonly string[] } = { enabled: false, immediate: false, messages: [] };

  /** Bandeiras sumidas do último quadro (o renderer de entidades as desenha na sala). */
  lastOldFlags: readonly { team: 0 | 1 | 2; pos: WorldCoords; unknownFor: number }[] = [];
  /** Opções gráficas avançadas (OG-070). */
  graphics: GraphicsOptions = DEFAULT_GRAPHICS;

  setOptions(o: { showFlagMessages: boolean; showKillMessages: boolean; quickMessages: { enabled: boolean; immediate: boolean; messages: readonly string[] }; graphics?: GraphicsOptions }): void {
    this.feed.showFlagMessages = o.showFlagMessages;
    this.feed.showKillMessages = o.showKillMessages;
    this.quick = o.quickMessages;
    if (o.graphics) this.graphics = o.graphics;
  }

  private sendChat(): void {
    const text = this.chat.trim();
    if (text && text !== '.') this.session.send(message('chat', { text, teamOnly: text.startsWith('.') }));
    this.chat = '';
  }

  /** Tecla durante o jogo; devolve true se foi usada pelo chat. */
  onKey(ev: KeyboardEvent, isGameKey: (ev: KeyboardEvent) => boolean): boolean {
    // mensagem rápida: Alt+1..9 e Alt+0 (10ª), só com a linha de chat vazia. No Mac também Cmd+número,
    // que o Chrome só deixa chegar ao jogo no modo foco (OG-232)
    const digit = /^Digit(\d)$/.exec(ev.code);
    const quickKey = (ev.altKey && !ev.metaKey) || (IS_MAC && ev.metaKey && !ev.altKey);
    if (quickKey && !ev.ctrlKey && digit && this.quick.enabled && !this.chat) {
      const text = this.quick.messages[(Number(digit[1]) + 9) % 10] ?? '';
      // vazia também é do jogo: Alt+número não troca de aba (Firefox) nem digita símbolo (Option no Mac)
      if (!text) return true;
      this.chat = text;
      if (this.quick.immediate) this.sendChat();
      return true;
    }
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return false;
    if (ev.key === 'Enter') {
      this.sendChat();
      return true;
    }
    if (!this.chat) {
      // tecla do jogo não começa o chat
      if (ev.key.length !== 1 || isGameKey(ev)) return false;
    }
    if (ev.key === 'Escape' || ev.key === 'Backspace') {
      if (!this.chat) return false;
      this.chat = ev.key === 'Escape' ? '' : this.chat.slice(0, -1);
      return true;
    }
    // só Latin-1 imprimível (as fontes do original não têm outros glifos)
    if (ev.key.length === 1 && ev.key >= ' ' && ev.key.charCodeAt(0) <= 0xff && ev.key.charCodeAt(0) !== 0x7f) {
      if (this.chat.length < MAX_CHAT_LENGTH) this.chat += ev.key;
      return true;
    }
    return false;
  }

  /** Estado do HUD neste quadro. `fd` é o mundo extrapolado (null com o jogo escondido). */
  build(opts: {
    screen: ScreenLayout;
    rooms: RoomLayout;
    topLeft: WorldCoords;
    fd: WorldState | null;
    now: number;
    fps: number;
    showPings: boolean;
  }): HudState | null {
    const s = this.session;
    const fx = s.world;
    if (!fx) return null;
    const frame = fx.frame;
    // sem mundo extrapolado (esperando a partida), o último frame do servidor
    const time = opts.fd ? opts.fd.frame / 10 : Math.max(0, s.lastServerFrame) / 10;

    // `calculateVisibilities`: alfa de cada jogador e visibilidade de cada sala
    const shadow = s.powerupEnd.shadow > time;
    const roomVis = Array.from({ length: fx.map.width }, () => new Array<number>(fx.map.height).fill(shadow ? 255 : 0));
    const alphaOf = new Map<number, number>();
    // "Disappeared players on minimap": fade (10→20 frames), hide early (12) ou hide late (20)
    const { max: FADE_MAX, start: FADE_START } = minimapFade(this.graphics.minimapPlayers);
    for (const p of fx.players) {
      if (!p) continue;
      const updated = s.posUpdated.get(p.pid) ?? -Infinity;
      const isMe = p.pid === s.me;
      let alpha = 0;
      if ((!p.dead && updated > frame - FADE_MAX) || isMe) {
        alpha = frame > updated + FADE_START && !isMe ? 255 - Math.trunc(((frame - updated - FADE_START) * 255) / (FADE_MAX - FADE_START)) : 255;
        const row = roomVis[p.pos.roomX];
        if (row && p.pos.roomY < fx.map.height) row[p.pos.roomY] = Math.max(row[p.pos.roomY] as number, alpha);
      }
      alphaOf.set(p.pid, alpha);
    }

    const posOf = (pid: number): WorldCoords | null => {
      const p = (s.onscreen.has(pid) || pid === s.me ? opts.fd?.players[pid] : undefined) ?? fx.players[pid];
      return p ? coords(p.pos) : null;
    };
    const flagTeamOf = (pid: number): number => {
      const c = s.carriedFlag(pid);
      const team = fx.teamOf(pid);
      return c === CarriedFlag.None ? -1 : c === CarriedFlag.Wild ? 2 : c === CarriedFlag.Own ? team : 1 - team;
    };
    const players: HudPlayer[] = [];
    for (const p of fx.players) {
      if (!p) continue;
      const pos = posOf(p.pid);
      if (!pos) continue;
      players.push({
        pid: p.pid,
        team: p.team,
        name: s.names.get(p.pid) ?? '',
        color: s.colors.get(p.pid) ?? 16,
        frags: s.frags.get(p.pid) ?? p.stats.frags,
        ping: s.pings.get(p.pid) ?? 0,
        flagTeam: flagTeamOf(p.pid),
        pos,
        alpha: alphaOf.get(p.pid) ?? 0,
        me: p.pid === s.me,
        account: s.playerInfo.get(p.pid)?.loggedIn ?? false,
      });
    }

    const flags: HudFlag[] = [];
    const oldFlags: { team: 0 | 1 | 2; pos: WorldCoords; unknownFor: number }[] = [];
    for (const team of [0, 1, 2] as const)
      fx.flagsOf(team).forEach((f, i) => {
        const key = `${team}.${i}`;
        if (f.status !== 'carried') {
          this.flagSeen.delete(key);
          flags.push({
            team,
            pos: coords(f.pos),
            carried: false,
            flash: this.graphics.highlightReturnedFlags && time < (s.flagReturnTime.get(key) ?? -10) + 2 && Math.trunc((time * 15) % 3) === 0,
            alpha: 255,
          });
          return;
        }
        const carrierPos = posOf(f.carrier) ?? coords(f.pos);
        if (s.onscreen.has(f.carrier) || f.carrier === s.me) this.flagSeen.set(key, carrierPos);
        else if (this.graphics.oldFlagPositions && (s.posUpdated.get(f.carrier) ?? -Infinity) > frame - OLD_FLAG_FRAMES)
          oldFlags.push({ team, pos: this.flagSeen.get(key) ?? coords(f.pos), unknownFor: (frame - (s.posUpdated.get(f.carrier) ?? frame)) / 10 });
        flags.push({ team, pos: carrierPos, carried: true, flash: false, alpha: alphaOf.get(f.carrier) ?? 0 });
      });

    this.lastOldFlags = oldFlags;
    // destaque ao nascer
    const meP = opts.fd?.players[s.me] ?? fx.players[s.me];
    if (!meP || meP.dead) this.deadAfterHighlighted = true;
    else if (this.deadAfterHighlighted) {
      this.deadAfterHighlighted = false;
      this.spawnTime = time;
    }
    const highlight = time - this.spawnTime < HIGHLIGHT_TIME ? 1 - (time - this.spawnTime) / HIGHLIGHT_TIME : 0;

    const ordered = scoreboardOrder(players, this.scoreOrder);
    this.scoreOrder = ordered.map((p) => p.pid);
    const hiddenGame = s.skipped || s.gameOver !== null || !opts.fd;
    const playing = players.length > 1;
    const chatCount = chatLines(opts.screen, this.showAll);
    if (s.lastServerFrame >= 0) this.feed.stamp(s.lastServerFrame / 10);
    return {
      screen: opts.screen,
      rooms: opts.rooms,
      topLeft: opts.topLeft,
      map: fx.map,
      time,
      maxPlayers: fx.maxPlayers,
      players: ordered,
      flags,
      oldFlags,
      roomVis,
      scores: s.teamScores,
      showPings: opts.showPings,
      self: meP
        ? {
            health: meP.health,
            energy: meP.energy,
            weapon: s.weapon,
            power: s.powerupEnd.power - time,
            turbo: s.powerupEnd.turbo - time,
            shadow: s.powerupEnd.shadow - time,
            highlight: meP.dead || !this.graphics.spawnHighlight ? 0 : highlight,
            pos: coords(meP.pos),
          }
        : null,
      mapTime: s.mapEnd !== null && s.gameOver === null && playing ? { seconds: s.mapEnd - Math.trunc(time), extra: s.extraTime } : null,
      fps: opts.fps,
      chat: this.feed.visible(chatCount, time, this.showAll, opts.screen.chatChars),
      prompt: chatPrompt(this.chat, this.t),
      // com o mapa carregado, "Waiting game start - next map is" aparece também junto do placar
      hidden: hiddenGame ? { gameOver: s.gameOver, waitingMap: s.world?.map.title ?? null } : null,
      notResponding: s.lastPacketTime > 0 && opts.now - s.lastPacketTime > 1000,
      // caixa da área visível: com mais de uma sala ou rolagem, se a opção estiver ligada
      neighborMarkers: showNeighborMarkers(this.graphics.neighborMarkers, Math.max(opts.rooms.visibleX, opts.rooms.visibleY)),
      solidFog: this.graphics.lessTransparency,
      underlineAccounts: this.graphics.underlineAccounts,
      highlightRooms: (opts.rooms.visibleX > 1 || opts.rooms.visibleY > 1 || this.graphics.scroll) && this.graphics.boxVisibleArea,
      changeTeams: this.wantChangeTeams,
      mapExit: this.wantMapExit ? (this.mapExitDelayed ? 'delayed' : 'on') : null,
      pause: this.pauseOverlay(),
    };
  }
}
