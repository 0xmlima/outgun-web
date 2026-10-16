// SPDX-License-Identifier: GPL-2.0-or-later
// HUD da partida: port de `draw_game_frame` (fora das salas), `draw_map`, `draw_scoreboard`, barra de
// indicadores, mensagens e chat, marcadores de vizinhos e destaque ao nascer
// (src/guiclient.cpp:3432-3830, src/graphics.cpp; plan/specs/hud.md).
import { iround, positiveFmod, positiveModulo, ROOM_HEIGHT, ROOM_WIDTH, type GameMap, type WorldCoords } from '@outgun/sim';
import { Container, Sprite, Texture, type BitmapFont } from 'pixi.js';
import { DrawList, registerFontSize } from '../render/draw-list.js';
import { pfScale, roomOffsetsX, roomOffsetsY, type RoomLayout } from '../render/layout.js';
import { colour, type RoomTheme } from '../render/theme.js';
import type { FeedLine, Translate } from './feed.js';
import { HudFaces, type FaceWeight, type HudFace } from './hud-faces.js';
import type { Place } from './modern-layout.js';
import { FOG_MAX_ALPHA, minimapPoint, minimapRect, minimapRoom, paintMinimap } from './minimap.js';
import { scaleBy, type FontMetrics, type ScreenLayout } from './screen-layout.js';

/** Fonte do jogo e a de contorno (OG-013). */
export class GameFont implements FontMetrics {
  readonly height: number;
  constructor(
    readonly main: BitmapFont,
    readonly border: BitmapFont | null,
  ) {
    this.height = Math.round(main.lineHeight);
    registerFontSize(main.fontFamily, main.baseMeasurementFontSize);
    if (border) registerFontSize(border.fontFamily, border.baseMeasurementFontSize);
  }
  get family(): string {
    return this.main.fontFamily;
  }
  charWidth(ch: string): number {
    return this.main.chars[ch]?.xAdvance ?? this.main.chars['?']?.xAdvance ?? 8;
  }
  width(text: string): number {
    let w = 0;
    for (const ch of text) w += this.charWidth(ch);
    return w;
  }
}

export interface HudPlayer {
  readonly pid: number;
  readonly team: 0 | 1;
  readonly name: string;
  /** Cor pessoal 0..15. */
  readonly color: number;
  readonly frags: number;
  readonly ping: number;
  /** Bandeira carregada: −1 nenhuma, 0/1 do time, 2 selvagem. */
  readonly flagTeam: number;
  /** Última posição conhecida (frame ou minimapa). */
  readonly pos: WorldCoords;
  /** 0..255: quão recente é a posição (`ClientPlayer::alpha`); 0 = fora do minimapa. */
  readonly alpha: number;
  readonly me: boolean;
  /** Tem conta (sublinhado no placar com "Underline master-authenticated players", OG-070). */
  readonly account?: boolean;
}

export interface HudFlag {
  readonly team: 0 | 1 | 2;
  readonly pos: WorldCoords;
  readonly carried: boolean;
  /** Pisca (voltou à base há menos de 2 s). */
  readonly flash: boolean;
  /** Alfa do portador (bandeiras carregadas). */
  readonly alpha: number;
}

export interface HudState {
  readonly screen: ScreenLayout;
  readonly rooms: RoomLayout;
  readonly topLeft: WorldCoords;
  readonly map: GameMap;
  /** Tempo do jogo (s). */
  readonly time: number;
  readonly maxPlayers: number;
  readonly players: readonly HudPlayer[];
  readonly flags: readonly HudFlag[];
  /** Bandeiras carregadas por quem saiu da vista há pouco (posição antiga). */
  readonly oldFlags: readonly { team: 0 | 1 | 2; pos: WorldCoords; unknownFor: number }[];
  /** Visibilidade de cada sala 0..255 (`calculateVisibilities`), [x][y]. */
  readonly roomVis: readonly (readonly number[])[];
  readonly scores: readonly [number, number];
  readonly showPings: boolean;
  /** Indicadores do próprio jogador; null sem jogador (só o placar). */
  readonly self: {
    health: number;
    energy: number;
    weapon: number;
    power: number;
    turbo: number;
    shadow: number;
    /** Destaque ao nascer: 1 → 0 em 0,5 s; 0 = não desenha. */
    highlight: number;
    pos: WorldCoords;
  } | null;
  readonly mapTime: { seconds: number; extra: boolean } | null;
  readonly fps: number;
  readonly chat: readonly FeedLine[];
  readonly prompt: { text: string; cursor: number };
  /** O jogo está escondido (carregando, placar, frame pulado): só os avisos. */
  readonly hidden: { gameOver: { reason: string; red: number; blue: number } | null; waitingMap: string | null } | null;
  readonly notResponding: boolean;
  /** Destaca no minimapa as salas na tela (mais de 1 sala na tela). */
  readonly highlightRooms: boolean;
  /** Opções do OG-070 que o HUD desenha: marcadores de vizinhos, névoa sólida, sublinhado de quem tem conta. */
  readonly neighborMarkers?: boolean;
  readonly solidFog?: boolean;
  readonly underlineAccounts?: boolean;
  /** Pediu troca de time (Ctrl+End): "CHANGE TEAMS" piscando. */
  readonly changeTeams: boolean;
  /** Votou para sair do mapa (F8): "EXIT MAP" piscando, ou cinza se o voto ainda não vale. */
  readonly mapExit: 'on' | 'delayed' | null;
  /**
   * Overlay da pausa do Ranked (OG-264, RN-UI-05): caixa única no centro da área de jogo, só com o
   * jogo pausado; fora da pausa nada muda. `options` = voto do bot substituto (clicável).
   */
  readonly pause?: {
    title: string;
    detail: string;
    options: { label: string; chosen: boolean; bot: boolean }[] | null;
    footer: string;
    hint: string | null;
  } | null;
}

/** Área clicável de uma opção do voto, em pixels da tela do HUD. */
export interface VoteTarget {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  bot: boolean;
}

const PLAYER_COLOURS = Array.from({ length: 16 }, (_, i) => `player${String(i + 1).padStart(2, '0')}`);

/** Nome no placar: até 15 caracteres (ou o que couber); com a tag do clã (OG-206) o que passar vira "...". */
export function scoreboardName(name: string, max = 15): string {
  return name.length > max ? `${name.slice(0, Math.max(0, max - 3))}...` : name;
}

export class HudRenderer {
  readonly stage = new Container();
  private readonly list: DrawList;
  private readonly minimapSprite = new Sprite();
  private minimapKey = '';
  /** Opções do voto desenhadas no último `render` (para o clique). */
  voteTargets: VoteTarget[] = [];
  private minimapTexture: Texture | null = null;
  /** Fontes Inter do HUD Moderno e do Personalizado (D-55). */
  private readonly faces: HudFaces;

  constructor(
    private readonly theme: RoomTheme,
    private readonly font: GameFont,
    private readonly t: Translate,
    private readonly resolution: number,
  ) {
    const top = new Container();
    this.stage.addChild(this.minimapSprite, top);
    this.list = new DrawList(top);
    this.faces = new HudFaces(resolution);
  }

  private c(name: string): string {
    return colour(this.theme, name);
  }

  private teamCol(team: number): string {
    return this.c(['team_red_basic', 'team_blue_basic', 'wild_flag'][team] as string);
  }

  private teamLight(team: number): string {
    return this.c(team === 0 ? 'team_red_light' : 'team_blue_light');
  }

  private rect(x1: number, y1: number, x2: number, y2: number, col: string, alpha = 1): void {
    // `rectfill` inclui as duas pontas
    this.list.g().rect(x1, y1, x2 - x1 + 1, y2 - y1 + 1).fill({ color: col, alpha });
  }

  private hline(x1: number, y: number, x2: number, col: string): void {
    this.rect(x1, y, x2, y, col);
  }

  private vline(x: number, y1: number, y2: number, col: string): void {
    this.rect(x, y1, x, y2, col);
  }

  /** Escala do texto em uso (a do HUD; o placar troca pela dele, OG-294). */
  private k = 1;

  /** Largura do texto na escala em uso. */
  private fw(text: string): number {
    return this.font.width(text) * this.k;
  }

  /** Altura da fonte na escala em uso. */
  private get fh(): number {
    return this.font.height * this.k;
  }

  /** `textout_ex` / `print_text_border`: contorno com a fonte de borda em (x−1, y−1) por caractere. */
  private text(text: string, x: number, y: number, col: string, opts: { centre?: boolean; border?: boolean } = {}): void {
    if (!text) return;
    const k = this.k;
    const x0 = opts.centre ? x - Math.trunc(this.fw(text) / 2) : x;
    if (opts.border) {
      const borderCol = this.c('text_border');
      let dx = x0;
      for (const ch of text) {
        if (this.font.border) this.list.text(this.font.border.fontFamily, ch, dx - k, y - k, borderCol, k);
        dx += this.font.charWidth(ch) * k;
      }
      if (!this.font.border)
        for (const [i, j] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const) this.list.text(this.font.family, text, x0 + i * k, y + j * k, borderCol, k);
    }
    this.list.text(this.font.family, text, x0, y, col, k);
  }

  render(s: HudState): void {
    this.list.begin();
    const L = s.screen;
    this.k = L.ui;
    const fh = this.fh;
    if (!s.hidden) {
      this.drawMinimap(s);
      this.drawPlayfieldMarks(s);
    } else this.minimapSprite.visible = false;

    if (s.hidden) this.drawHidden(s);

    if (L.mode === 'componentes') {
      this.drawComponents(s);
      if (s.showPings) this.drawTabScoreboard(s);
    } else {
      this.drawScoreboard(s);
      this.k = L.ui;

      // FPS no canto de baixo à direita
      const fps = this.t('FPS:$1', String(Math.trunc(s.fps)).padStart(3, ' '));
      this.text(fps, L.screenW - 2 - this.fw(fps), L.screenH - fh - 2, this.c('fps'));

      if (s.mapTime) {
        const sec = Math.max(0, s.mapTime.seconds);
        const str = `${s.mapTime.extra ? this.t('ET') + ' ' : ''}${Math.trunc(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
        this.text(str, L.timeX - this.fw(str), L.timeY, this.c('map_time'));
      }

      if (s.self) {
        const pups = [
          ['Power', s.self.power, 'power'],
          ['Turbo', s.self.turbo, 'turbo'],
          ['Shadow', s.self.shadow, 'shadow'],
        ] as const;
        pups.forEach(([caption, val, col], line) => {
          if (val <= 0) return;
          const y = L.indicatorsY + line * (fh + 2 * L.ui);
          this.text(this.t(caption), L.pupsX, y, this.c(col));
          const v = String(iround(val)).padStart(3, ' ');
          this.text(v, L.pupsValX - this.fw(v), y, this.c(col));
        });
        this.text(this.t('Weapon $1', String(s.self.weapon)), L.weaponX, L.indicatorsY, this.c('weapon'));
        this.drawChangeMessages(s);
        this.drawBar(s, L.healthX, this.t('Health'), s.self.health, 'health');
        this.drawBar(s, L.energyX, this.t('Energy'), s.self.energy, 'energy');
      }

      this.drawChat(s);
    }
    this.drawPause(s);

    if (s.notResponding) {
      // `m_notResponding`: caixa no meio da tela
      const lines = [this.t('Server not responding'), this.t('May be heavy packet loss,'), this.t('or the server disconnected.')];
      const w = Math.max(...lines.map((l) => this.fw(l))) + 20;
      const h = lines.length * (fh + 4) + 12;
      const x = Math.trunc((L.screenW - w) / 2);
      const y = Math.trunc((L.screenH - h) / 2);
      this.rect(x, y, x + w, y + h, this.c('menu_background'));
      this.rect(x, y, x + w, y + fh + 6, this.c('menu_caption_bg'));
      lines.forEach((l, i) => this.text(l, x + 10, y + 4 + i * (fh + 4) + (i ? 6 : 0), this.c(i ? 'menu_value' : 'menu_caption')));
    }
    this.list.end();
  }

  /** Avisos com o jogo escondido: placar do fim por capturas ou voto e o próximo mapa. */
  private drawHidden(s: HudState): void {
    const L = s.screen;
    if (!s.hidden) return;
    const cx = L.playfield.x + Math.trunc(scaleBy(L.mul, ROOM_WIDTH) / 2);
    const py = (v: number) => L.playfield.y + scaleBy(L.mul, v);
    const go = s.hidden.gameOver;
    // o placar aparece no fim por capturas e na troca por voto (`NEXTMAP_CAPTURE_LIMIT`, `NEXTMAP_VOTE_EXIT`)
    if (go && (go.reason === 'captureLimit' || go.reason === 'vote')) {
      const team = go.red > go.blue ? 0 : go.blue > go.red ? 1 : -1;
      const col = team === -1 ? this.c('game_draw') : this.teamLight(team);
      const caption = team === 0 ? 'RED TEAM WINS' : team === 1 ? 'BLUE TEAM WINS' : 'GAME TIED';
      const [a, b] = team === 1 ? [go.blue, go.red] : [go.red, go.blue];
      this.text(this.t(caption), cx, py(ROOM_HEIGHT / 2 - 40), col, { centre: true });
      this.text(this.t('SCORE $1 - $2', String(a), String(b)), cx, py(ROOM_HEIGHT / 2 - 20), col, { centre: true });
    }
    if (s.hidden.waitingMap !== null) {
      this.text(this.t('Waiting game start - next map is'), cx, py(ROOM_HEIGHT / 2 + 20), this.c('map_loading_1'), { centre: true });
      this.text(s.hidden.waitingMap, cx, py(ROOM_HEIGHT / 2 + 50), this.c('map_loading_2'), { centre: true });
    }
  }

  /** "CHANGE TEAMS" e "EXIT MAP" piscando no canto de baixo da área de jogo. */
  private drawChangeMessages(s: HudState): void {
    const L = s.screen;
    if (s.changeTeams) {
      // `draw_change_team_message`: pisca a 2 Hz no canto de baixo da área de jogo
      const col = this.c(Math.trunc(positiveFmod(s.time * 2, 2)) ? 'change_message_1' : 'change_message_2');
      const x = L.playfield.x + scaleBy(L.mul, ROOM_WIDTH - 6 * 8 + 10);
      this.text(this.t('CHANGE'), x, L.playfield.y + scaleBy(L.mul, ROOM_HEIGHT - 18), col, { centre: true });
      this.text(this.t('TEAMS'), x, L.playfield.y + scaleBy(L.mul, ROOM_HEIGHT - 9), col, { centre: true });
    }
    if (s.mapExit) {
      // `draw_change_map_message`
      const x = L.playfield.x + scaleBy(L.mul, ROOM_WIDTH - 64 - 6 * 8);
      const delayed = s.mapExit === 'delayed';
      const col = delayed ? this.c('change_message_delayed') : this.c(Math.trunc(positiveFmod(s.time * 2, 2)) ? 'change_message_1' : 'change_message_2');
      this.text(this.t('EXIT'), x, L.playfield.y + scaleBy(L.mul, ROOM_HEIGHT - 18), col, { centre: true, border: delayed });
      this.text(this.t('MAP'), x, L.playfield.y + scaleBy(L.mul, ROOM_HEIGHT - 9), col, { centre: true, border: delayed });
    }
  }

  /** Overlay da pausa (OG-264): mesma caixa e cores do "Server not responding", no centro da área de jogo. */
  private drawPause(s: HudState): void {
    this.voteTargets = [];
    const p = s.pause;
    if (!p) return;
    const L = s.screen;
    const fh = this.fh;
    const lineH = fh + 4;
    const body = [p.detail, ...(p.options?.map((o) => o.label) ?? []), p.hint ?? '', p.footer].filter((l) => l !== '');
    const w = Math.max(this.fw(p.title), ...body.map((l) => this.fw(l))) + 20;
    const h = (body.length + 1) * lineH + 12;
    const cx = L.playfield.x + Math.trunc(scaleBy(L.mul, ROOM_WIDTH) / 2);
    const cy = L.playfield.y + Math.trunc(scaleBy(L.mul, ROOM_HEIGHT) / 2);
    const x = cx - Math.trunc(w / 2);
    const y = cy - Math.trunc(h / 2);
    this.rect(x, y, x + w, y + h, this.c('menu_background'));
    this.rect(x, y, x + w, y + fh + 6, this.c('menu_caption_bg'));
    this.text(p.title, cx, y + 4, this.c('menu_caption'), { centre: true });
    let ly = y + 4 + lineH + 6;
    const line = (text: string, col: string) => {
      this.text(text, x + 10, ly, col);
      ly += lineH;
    };
    if (p.detail) line(p.detail, this.c('menu_value'));
    for (const o of p.options ?? []) {
      if (o.chosen) this.rect(x + 6, ly - 2, x + w - 6, ly + fh + 1, this.c('menu_caption_bg'));
      this.voteTargets.push({ x0: x + 6, y0: ly - 2, x1: x + w - 6, y1: ly + fh + 1, bot: o.bot });
      line(o.label, this.c(o.chosen ? 'menu_caption' : 'menu_value'));
    }
    if (p.hint) line(p.hint, this.c('menu_caption'));
    line(p.footer, this.c('menu_value'));
  }

  /** `draw_bar`: legenda, valor e a barra em três faixas de 100. */
  private drawBar(s: HudState, x: number, caption: string, value: number, kind: 'health' | 'energy'): void {
    const L = s.screen;
    const fh = this.fh;
    const y = L.indicatorsY;
    const col = this.c('bar_text');
    this.text(caption, x, y, col);
    const val = String(value).padStart(3, ' ');
    const width = scaleBy(L.mul, 100);
    const valX = Math.max(x + this.fw(caption) + this.fw(' '), x + width - this.fw(val));
    this.text(val, valX, y, col);
    const y1 = y + Math.trunc((3 * fh) / 2);
    const y2 = L.screenH - 5 * L.ui;
    this.rect(x, y1, x + width, y2, this.c('bar_0'));
    if (value <= 0) return;
    for (const [i, name] of [`${kind}_100`, `${kind}_200`, `${kind}_300`].entries()) {
      const targ = Math.trunc((Math.min(value - 100 * i, 100) * width) / 100);
      if (i === 0 || targ > 0) this.rect(x, y1, x + targ, y2, this.c(name));
    }
  }

  /** `draw_scoreboard`. */
  private drawScoreboard(s: HudState): void {
    const L = s.screen;
    if (!L.scoreboard) {
      // sem placar (tela cheia): só o placar dos times embaixo do relógio
      const [r, b] = s.scores;
      const col = r > b ? this.c('team_red_light') : r < b ? this.c('team_blue_light') : this.c('game_draw');
      const str = `${r} - ${b}`;
      this.text(str, L.timeX - this.fw(str), L.timeY + this.fh, col);
      return;
    }
    // placar de borda a borda na coluna, na escala própria (OG-294); times empilhados ou lado a lado
    const { x1, y1, x2, y2, side } = L.scoreboard;
    this.k = L.scoreboard.scale;
    const k = this.k;
    const u = L.ui;
    const fh = this.fh;
    const charW = this.fw('M');
    const margin = 4 * u;
    const gap = 6 * u;
    const hpad = Math.round(6 * k);
    const half = s.maxPlayers / 2;
    const rows = half + 1;
    const ySpace = y2 - y1 + 1;
    const rowH = Math.trunc(Math.min(2 * fh, Math.max(fh + 2 * k, side ? ySpace / rows : (ySpace - gap) / (2 * rows))));
    const vpad = Math.max(Math.trunc((rowH - fh) / 2), 1);
    const blockW = side ? Math.trunc((x2 - x1 + 1 - 2 * margin - gap) / 2) : x2 - x1 + 1 - 2 * margin;
    const blocks = side
      ? [[x1 + margin, y1], [x1 + margin + blockW + gap, y1]]
      : [[x1 + margin, y1], [x1 + margin, y1 + rows * rowH + gap]];
    const bg = [this.c('scoreboard_bg_redteam'), this.c('scoreboard_bg_blueteam')];
    const lineCol = [this.c('scoreboard_line_redteam'), this.c('scoreboard_line_blueteam')];
    const dark = [this.c('team_red_dark'), this.c('team_blue_dark')];
    const fragsW = this.fw('000');
    /** Colunas de cada time: borda esquerda, onde começa o texto, divisória e fim dos frags. */
    const cols = blocks.map(([bx, by]) => {
      const bx1 = bx as number;
      const bx2 = bx1 + blockW - 1;
      const right = bx2 - hpad;
      return { bx1, bx2, by: by as number, textX: bx1 + hpad, divider: right - fragsW - Math.round(5 * k), right };
    });
    for (const i of [0, 1] as const) {
      const { bx1, bx2, by, textX, divider, right } = cols[i] as (typeof cols)[number];
      const lc = lineCol[i] as string;
      this.rect(bx1 + 1, by + rowH + 1, bx2 - 1, by + rows * rowH - 1, bg[i] as string);
      this.rect(bx1 + 1, by + 1, bx2 - 1, by + rowH - 1, dark[i] as string);
      for (let j = 0; j <= rows; j++) this.hline(bx1 + 1, by + j * rowH, bx2 - 1, lc);
      this.vline(bx1, by, by + rows * rowH, lc);
      this.vline(divider, by + rowH, by + rows * rowH, lc);
      this.vline(bx2, by, by + rows * rowH, lc);
      const capCol = this.c(i === 0 ? 'scoreboard_caption_redteam' : 'scoreboard_caption_blueteam');
      const rightText = s.showPings ? this.t('pings') : this.t('$1 capt', String(s.scores[i]).padStart(3, ' '));
      this.text(this.t(i === 0 ? 'Red Team' : 'Blue Team'), textX, by + vpad, capCol);
      this.text(rightText, right - this.fw(rightText), by + vpad, capCol);
    }
    const line = [1, 1];
    for (const p of s.players) {
      const { by, textX, divider, right } = cols[p.team] as (typeof cols)[number];
      const pc = Number.parseInt(this.c(PLAYER_COLOURS[p.color] ?? 'player_unknown').slice(1), 16);
      const light = (v: number) => 40 + Math.trunc((v * 215) / 255);
      const textCol = `#${[16, 8, 0].map((sh) => light((pc >> sh) & 255).toString(16).padStart(2, '0')).join('')}`;
      const y = by + (line[p.team] as number) * rowH + vpad;
      const nameX = textX + Math.round(8 * k);
      // nome cabe até a divisória dos frags (no máximo os 15 caracteres do original)
      const shown = scoreboardName(p.name, Math.min(15, Math.trunc((divider - nameX - 2 * k) / charW)));
      // `draw_scoreboard_name`: sublinha quem tem conta (opção, ligada no client.cfg distribuído)
      if (s.underlineAccounts && p.account) this.hline(nameX, y + fh, nameX + this.fw(shown) - 2, textCol);
      this.text(shown, nameX, y, textCol);
      const pts = String(s.showPings ? p.ping : p.frags);
      this.text(pts, right - this.fw(pts), y, this.teamLight(p.team));
      if (p.flagTeam >= 0) {
        const flag = Math.trunc(charW / 2);
        const pole = Math.trunc((7 * flag) / 4);
        const fy = y + Math.trunc((fh - pole) / 2);
        this.rect(textX, fy, textX + Math.max(1, Math.round(k)) - 1, fy + pole, this.c('flag_pole'));
        this.rect(textX + Math.max(1, Math.round(k)), fy, textX + Math.max(1, Math.round(k)) + flag, fy + flag, this.teamCol(p.flagTeam));
      }
      line[p.team] = (line[p.team] as number) + 1;
    }
  }

  /** `draw_map`: fundo, névoa, salas na tela, jogadores e bandeiras. */
  private drawMinimap(s: HudState): void {
    const place = s.screen.minimapPlace;
    if (!place) {
      this.minimapSprite.visible = false;
      return;
    }
    const map = s.map;
    const r = minimapRect(place, map.width, map.height);
    const key = `${map.title}|${map.crc}|${r.w}x${r.h}|${place.w}|${this.resolution}`;
    if (key !== this.minimapKey) {
      this.minimapKey = key;
      this.minimapTexture?.destroy(true);
      const canvas = paintMinimap(map, r.w, r.h, place.w, {
        ground: this.c('map_ground'),
        wall: this.c('map_wall'),
        roomBorder: this.c('map_room_border'),
        teamDark: [this.c('team_red_dark'), this.c('team_blue_dark')],
        team: [this.teamCol(0), this.teamCol(1), this.teamCol(2)],
      }, this.resolution);
      this.minimapTexture = Texture.from(canvas);
      this.minimapSprite.texture = this.minimapTexture;
    }
    this.minimapSprite.visible = true;
    this.minimapSprite.position.set(r.x, r.y);
    this.minimapSprite.width = r.w;
    this.minimapSprite.height = r.h;

    // névoa nas salas sem informação
    for (let rx = 0; rx < map.width; rx++)
      for (let ry = 0; ry < map.height; ry++) {
        const vis = (s.roomVis[rx]?.[ry] ?? 0) / 255;
        if (vis >= 0.99) continue;
        const room = minimapRoom(r, map.width, map.height, rx, ry);
        // "Less transparency effects": névoa inteira em toda sala sem visão completa (`minibg_fog`)
        this.list.g().rect(room.x, room.y, room.w, room.h).fill({ color: this.c('map_fog'), alpha: FOG_MAX_ALPHA * (s.solidFog ? 1 : 1 - vis) });
      }
    if (s.highlightRooms) this.highlightRooms(s, r);

    const point = (pos: WorldCoords) => minimapPoint(r, map.width, map.height, pos);
    const scl = place.w;
    const miniFlag = (team: number, pos: WorldCoords, flash: boolean, old: boolean, alpha: number) => {
      const [x, y] = point(pos);
      const g = this.list.g();
      const shape = (x1: number, y1: number, x2: number, y2: number, col: string) => {
        if (old) g.rect(x1 + 0.5, y1 + 0.5, x2 - x1, y2 - y1).stroke({ color: col, width: 1, alpha });
        else g.rect(x1, y1, x2 - x1 + 1, y2 - y1 + 1).fill({ color: col, alpha });
      };
      shape(x, y - Math.trunc(scl / 32), x + Math.trunc(scl / 160) - 1, y, this.c('flag_pole'));
      shape(x + 1, y - Math.trunc(scl / 32), x + Math.trunc(scl / 32), y - Math.trunc(scl / 80), flash ? this.c(['team_red_flash', 'team_blue_flash', 'wild_flag_flash'][team] as string) : this.teamCol(team));
    };
    for (const f of s.oldFlags) miniFlag(f.team, f.pos, false, true, 150 / 255);
    const a = scaleBy(s.screen.mul, 1);
    const b = Math.trunc(a / 2);
    for (const p of s.players) {
      if (p.alpha <= 0) continue;
      const alpha = p.alpha / 255;
      if (p.flagTeam >= 0) miniFlag(p.flagTeam, p.pos, false, false, alpha);
      const [x, y] = point(p.pos);
      const g = this.list.g();
      if (!p.me) {
        g.rect(x - a, y - a, 2 * a + 1, 2 * a + 1).fill({ color: this.teamCol(p.team), alpha });
        if (a > 0) g.rect(x - b, y - b, 2 * b + 1, 2 * b + 1).fill({ color: this.c(PLAYER_COLOURS[p.color] ?? 'player_unknown'), alpha });
      } else if (Math.trunc(positiveFmod(s.time * 15, 3)) > 0) {
        g.circle(x + 0.5, y + 0.5, s.screen.mul * 2 + 0.5).fill(this.c('map_player_me_1'));
        g.circle(x + 0.5, y + 0.5, s.screen.mul + 0.5).fill(this.teamLight(p.team));
      } else g.circle(x + 0.5, y + 0.5, s.screen.mul * 2 + 0.5).fill(this.c('map_player_me_2'));
    }
    for (const f of s.flags) if (!f.carried) miniFlag(f.team, f.pos, f.flash, false, 1);
  }

  /** `highlight_minimap_rooms`: retângulo das salas que estão na tela. */
  private highlightRooms(s: HudState, r: { x: number; y: number; w: number; h: number }): void {
    const { mapW, mapH, visibleX, visibleY } = s.rooms;
    const x0 = r.x;
    const y0 = r.y;
    const xm = x0 + r.w - 1;
    const ym = y0 + r.h - 1;
    let xPos = positiveFmod(s.topLeft.room.x + s.topLeft.x / ROOM_WIDTH, mapW);
    let yPos = positiveFmod(s.topLeft.room.y + s.topLeft.y / ROOM_HEIGHT, mapH);
    const x1 = visibleX > mapW ? x0 : x0 + Math.trunc((xPos / mapW) * r.w);
    const y1 = visibleY > mapH ? y0 : y0 + Math.trunc((yPos / mapH) * r.h);
    xPos = positiveFmod(xPos + visibleX, mapW);
    yPos = positiveFmod(yPos + visibleY, mapH);
    const x2 = visibleX > mapW ? xm : x0 + positiveModulo(Math.trunc((xPos / mapW) * r.w) - 1, r.w);
    const y2 = visibleY > mapH ? ym : y0 + positiveModulo(Math.trunc((yPos / mapH) * r.h) - 1, r.h);
    const col = this.c('map_room_highlight');
    if (visibleY <= mapH) {
      if (x2 <= x1) {
        this.hline(x0, y1, x2, col);
        this.hline(x0, y2, x2, col);
        this.hline(x1, y1, xm, col);
        this.hline(x1, y2, xm, col);
      } else {
        this.hline(x1, y1, x2, col);
        this.hline(x1, y2, x2, col);
      }
    }
    if (visibleX <= mapW) {
      if (y2 <= y1) {
        this.vline(x1, y0, y2, col);
        this.vline(x2, y0, y2, col);
        this.vline(x1, y1, ym, col);
        this.vline(x2, y1, ym, col);
      } else {
        this.vline(x1, y1, y2, col);
        this.vline(x2, y1, y2, col);
      }
    }
  }

  /** Marcadores de vizinhos (`draw_neighbor_marker`) e destaque ao nascer (`draw_me_highlight`). */
  private drawPlayfieldMarks(s: HudState): void {
    const R = s.rooms;
    const pf = (v: number) => pfScale(R, v);
    const xMax = R.x0 + R.width - 1;
    const yMax = R.y0 + R.height - 1;
    const distance = (coord: number, start: number, size: number, mapSize: number) => {
      if (positiveFmod(coord - start, mapSize) <= size) return 0;
      const diff = positiveFmod(coord - (start + size / 2), mapSize);
      return diff < mapSize / 2 ? diff - size / 2 : diff - mapSize + size / 2;
    };
    const marker = (flag: boolean, pos: WorldCoords, team: number, old: boolean, alpha: number) => {
      const dx = distance(pos.room.x + pos.x / ROOM_WIDTH, s.topLeft.room.x + s.topLeft.x / ROOM_WIDTH, R.visibleX, R.mapW);
      const dy = distance(pos.room.y + pos.y / ROOM_HEIGHT, s.topLeft.room.y + s.topLeft.y / ROOM_HEIGHT, R.visibleY, R.mapH);
      let xs: number[];
      let ys: number[];
      let dist: number;
      if (dx) {
        if (dy) return;
        xs = [dx < 0 ? R.x0 + pf(15) : xMax - pf(15)];
        dist = Math.abs(dx);
        ys = roomOffsetsY(R, s.topLeft, pos.room.y).map((y) => y + pf(pos.y));
      } else {
        if (!dy) return;
        ys = [dy < 0 ? R.y0 + pf(15) : yMax - pf(15)];
        dist = Math.abs(dy);
        xs = roomOffsetsX(R, s.topLeft, pos.room.x).map((x) => x + pf(pos.x));
      }
      if (dist >= 1) return;
      const g = this.list.g();
      const col = this.teamCol(team);
      for (const x of xs)
        for (const y of ys) {
          if (flag) {
            const size = pf(8 - 3 * dist);
            const fx = x - Math.trunc(size / 2);
            const fy = y - Math.trunc(size / 2);
            if (old) g.rect(fx + 0.5, fy + 0.5, size, size).stroke({ color: col, width: 1, alpha });
            else g.rect(fx, fy, size + 1, size + 1).fill({ color: col, alpha });
          } else g.circle(x + 0.5, y + 0.5, R.scale * (10 - 5 * dist)).stroke({ color: col, width: 1, alpha });
        }
    };
    if (s.neighborMarkers) {
      for (const f of s.oldFlags) marker(true, f.pos, f.team, true, 150 / 255);
      for (const p of s.players) if (p.alpha > 0) marker(false, p.pos, p.team, false, p.alpha / 255);
      for (const f of s.flags) if (!f.carried || f.alpha > 0) marker(true, f.pos, f.team, false, f.carried ? f.alpha / 255 : 1);
    }

    if (s.self && s.self.highlight > 0) {
      const radius = R.scale * (8 * s.self.highlight + 1) * 15; // PLAYER_RADIUS = 15
      const g = this.list.g();
      for (const x of roomOffsetsX(R, s.topLeft, s.self.pos.room.x))
        for (const y of roomOffsetsY(R, s.topLeft, s.self.pos.room.y)) {
          const cx = x + pf(s.self.pos.x);
          const cy = y + pf(s.self.pos.y);
          if (cx >= R.x0 && cx <= xMax && cy >= R.y0 && cy <= yMax) g.circle(cx + 0.5, cy + 0.5, radius).stroke({ color: this.c('spawn_highlight'), width: 1 });
        }
    }
  }

  /** Cor de uma mensagem do chat pelo tipo e pelo time. */
  private chatColour(msg: FeedLine): string {
    const teamName = msg.team === 0 ? 'redteam' : msg.team === 1 ? 'blueteam' : 'unknown';
    if (msg.type === 'warning') return this.c('message_warning');
    if (msg.type === 'team') return this.c(`team_message_${teamName}`);
    if (msg.type === 'info') return this.c('message_info');
    if (msg.type === 'header') return this.c('message_header');
    if (msg.type === 'server' || msg.type === 'admin') return this.c('message_server');
    return this.c(`normal_message_${teamName}`);
  }

  // ---- HUD Moderno e Personalizado (D-55, RN-UI-07): componentes em Inter, nada sobre a sala ----

  private face(weight: FaceWeight, px: number): HudFace {
    return this.faces.get(weight, px);
  }

  /** Texto em Inter com o topo em `y`; `align` alinha pelo `x`. */
  private ftext(face: HudFace, text: string, x: number, y: number, col: string, align: 'left' | 'centre' | 'right' = 'left'): number {
    const w = face.width(text);
    if (text) this.list.text(face.name, text, align === 'centre' ? x - w / 2 : align === 'right' ? x - w : x, y, col, 1);
    return w;
  }

  private box(x: number, y: number, w: number, h: number, col: string, alpha = 1): void {
    if (w > 0 && h > 0) this.list.g().rect(x, y, w, h).fill({ color: col, alpha });
  }

  private frame(x: number, y: number, w: number, h: number, col: string, width: number): void {
    this.list.g().rect(x + width / 2, y + width / 2, w - width, h - width).stroke({ color: col, width });
  }

  /** Bandeirinha: mastro amarelo e pano na cor do time. */
  private flagGlyph(x: number, y: number, size: number, team: number): void {
    const pole = Math.max(1, Math.round(size * 0.12));
    this.box(x, y, pole, size, this.c('flag_pole'));
    this.box(x + pole, y, Math.round(size * 0.6), Math.round(size * 0.42), this.teamCol(team));
  }

  private clock(s: HudState): string {
    if (!s.mapTime) return '';
    const sec = Math.max(0, s.mapTime.seconds);
    return `${s.mapTime.extra ? this.t('ET') + ' ' : ''}${Math.trunc(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  private drawComponents(s: HudState): void {
    const places = s.screen.hud;
    if (!places) return;
    if (places.score) this.drawScore(s, places.score);
    if (s.self) {
      if (places.health) this.drawModernBar(places.health, this.t('Health'), s.self.health, 'health');
      if (places.energy) this.drawModernBar(places.energy, this.t('Energy'), s.self.energy, 'energy');
      if (places.powerups) this.drawPowerups(s, places.powerups);
      if (places.weapon) this.drawWeapon(places.weapon, s.self.weapon);
      this.drawChangeMessages(s);
    }
    if (places.chat) this.drawModernChat(s, places.chat);
    if (places.fps) {
      const f = places.fps;
      this.ftext(this.face(600, 11 * f.s), this.t('FPS:$1', String(Math.trunc(s.fps)).padStart(3, ' ')), f.x + f.w, f.y + f.h - this.face(600, 11 * f.s).height, this.c('fps'), 'right');
    }
  }

  /** Placar dos times e relógio: vermelho | relógio | azul; a bandeira levada aparece do lado de quem a leva. */
  private drawScore(s: HudState, p: Place): void {
    const cw = Math.round(p.w * 0.32);
    const side = Math.round((p.w - cw) / 2);
    const stripe = Math.max(2, Math.round(3 * p.s));
    const blueX = p.x + side + cw;
    this.box(p.x, p.y, side, p.h, this.c('team_red_dark'));
    this.box(p.x, p.y, side, stripe, this.c('team_red_basic'));
    this.box(blueX, p.y, p.w - side - cw, p.h, this.c('team_blue_dark'));
    this.box(blueX, p.y, p.w - side - cw, stripe, this.c('team_blue_basic'));
    this.box(p.x + side, p.y, cw, p.h, '#000000', 0.85);
    const big = this.face(800, p.h * 0.62);
    const ny = p.y + Math.round((p.h - big.height) / 2);
    this.ftext(big, String(s.scores[0]), p.x + side / 2, ny, '#ffffff', 'centre');
    this.ftext(big, String(s.scores[1]), blueX + side / 2, ny, '#ffffff', 'centre');
    const cf = this.face(600, p.h * 0.42);
    // sem limite de tempo: um traço no lugar do relógio
    const clock = this.clock(s);
    this.ftext(cf, clock || '\u2014', p.x + p.w / 2, p.y + Math.round((p.h - cf.height) / 2), clock ? this.c('map_time') : '#555555', 'centre');
    // bandeira do time t levada: aparece no lado do time adversário
    const fs = Math.round(p.h * 0.36);
    for (const team of [0, 1] as const) {
      if (!s.flags.some((f) => f.team === team && f.carried)) continue;
      const x = team === 0 ? blueX + (p.w - side - cw) - fs - Math.round(4 * p.s) : p.x + Math.round(6 * p.s);
      this.flagGlyph(x, p.y + Math.round((p.h - fs) / 2), fs, team);
    }
  }

  /** Vida ou energia: legenda e valor em cima, barra com as três faixas de 100 do original embaixo. */
  private drawModernBar(p: Place, caption: string, value: number, kind: 'health' | 'energy'): void {
    const label = this.face(600, 10 * p.s);
    const num = this.face(800, 16 * p.s);
    const top = Math.round(18 * p.s);
    this.ftext(label, caption.toUpperCase(), p.x, p.y + top - label.height, '#aaaaaa');
    this.ftext(num, String(value), p.x + p.w, p.y + top - num.height + Math.round(2 * p.s), '#ffffff', 'right');
    const by = p.y + top + Math.round(2 * p.s);
    const bh = p.y + p.h - by;
    this.box(p.x, by, p.w, bh, '#ffffff', 0.08);
    for (const [i, name] of [`${kind}_100`, `${kind}_200`, `${kind}_300`].entries()) {
      const f = Math.min(Math.max(value - 100 * i, 0), 100) / 100;
      if (f > 0) this.box(p.x, by, Math.round(p.w * f), bh, this.c(name));
    }
    for (let i = 1; i < 4; i++) this.box(p.x + Math.round((p.w * i) / 4), by, 1, bh, '#000000', 0.45);
  }

  /** Power, Turbo e Shadow: três quadros com o tempo restante; apagados quando inativos. */
  private drawPowerups(s: HudState, p: Place): void {
    if (!s.self) return;
    const gap = Math.round(6 * p.s);
    const w = Math.floor((p.w - 2 * gap) / 3);
    const label = this.face(600, 9.5 * p.s);
    const num = this.face(800, 16 * p.s);
    const items = [
      ['Power', s.self.power, 'power'],
      ['Turbo', s.self.turbo, 'turbo'],
      ['Shadow', s.self.shadow, 'shadow'],
    ] as const;
    items.forEach(([caption, val, colName], i) => {
      const x = p.x + i * (w + gap);
      const on = val > 0;
      const col = this.c(colName);
      this.box(x, p.y, w, p.h, on ? col : '#ffffff', on ? 0.12 : 0.04);
      this.frame(x, p.y, w, p.h, on ? col : '#2b2b2b', Math.max(1, Math.round(1.5 * p.s)));
      this.ftext(label, this.t(caption).toUpperCase(), x + w / 2, p.y + Math.round(5 * p.s), on ? col : '#666666', 'centre');
      this.ftext(num, on ? String(iround(val)) : '—', x + w / 2, p.y + p.h - num.height - Math.round(4 * p.s), on ? '#ffffff' : '#555555', 'centre');
    });
  }

  /** Nível da arma: legenda e quatro marcas nas cores dos power-ups de arma. */
  private drawWeapon(p: Place, level: number): void {
    const label = this.face(600, 10 * p.s);
    this.ftext(label, this.t('Weapon').toUpperCase(), p.x, p.y + Math.round((p.h - label.height) / 2), '#aaaaaa');
    const pw = Math.round(18 * p.s);
    const gap = Math.round(5 * p.s);
    const x0 = p.x + p.w - 4 * pw - 3 * gap;
    const y = p.y + Math.round(p.h * 0.25);
    const h = Math.round(p.h * 0.5);
    for (let i = 0; i < 4; i++) {
      const x = x0 + i * (pw + gap);
      if (i < level) this.box(x, y, pw, h, this.c(`pup_weapon_${i + 1}`));
      else this.frame(x, y, pw, h, '#444444', Math.max(1, Math.round(p.s)));
    }
  }

  /** Chat em Inter dentro do componente, sem contorno (nunca fica sobre a sala). */
  private drawModernChat(s: HudState, p: Place): void {
    const face = this.face(500, 13 * p.s);
    const lineH = s.screen.lineH;
    const dy = Math.round((lineH - face.height) / 2);
    let line = 0;
    for (const msg of s.chat) {
      const y = p.y + line * lineH + dy;
      line++;
      if (y + face.height > p.y + p.h) break;
      const col = this.chatColour(msg);
      let x = p.x;
      for (const part of msg.parts) x += this.ftext(face, part.text, x, y, part.color === 'default' ? col : this.c(`message_${part.color}`));
    }
    if (s.prompt.text) {
      const y = p.y + line * lineH + dy;
      const col = this.c('message_input');
      this.ftext(face, s.prompt.text, p.x, y, col);
      if (s.prompt.cursor >= 0 && Math.trunc(positiveFmod(performance.now() / 500, 2))) {
        const cx = p.x + face.width(s.prompt.text.slice(0, s.prompt.cursor));
        this.box(cx, y, Math.max(1, Math.round(p.s)), face.height, col);
      }
    }
  }

  /** TAB no Moderno e no Personalizado (OG-299): placar completo sobre a sala enquanto a tecla estiver pressionada. */
  private drawTabScoreboard(s: HudState): void {
    const R = s.screen.playfield;
    const k = s.screen.ui;
    const w = Math.round(Math.min(R.w * 0.86, 680 * k));
    const pad = Math.round(12 * k);
    const rowH = Math.round(24 * k);
    const perTeam = [0, 1].map((t) => s.players.filter((p) => p.team === t).sort((a, b) => b.frags - a.frags));
    const rows = Math.max(1, ...perTeam.map((l) => l.length));
    const head = Math.round(26 * k);
    const teamH = Math.round(rowH * 1.4);
    const colH = Math.round(16 * k);
    const h = pad * 2 + head + teamH + colH + rows * rowH;
    const x = R.x + Math.round((R.w - w) / 2);
    const y = R.y + Math.round((R.h - h) / 2);
    this.box(x, y, w, h, '#000000', 0.94);
    this.frame(x, y, w, h, '#2a5a1c', 1);
    const small = this.face(600, 11 * k);
    this.ftext(small, this.t('Scoreboard').toUpperCase(), x + pad, y + pad, '#aaaaaa');
    this.ftext(small, this.t('Release TAB to close'), x + w - pad, y + pad, '#777777', 'right');
    const colW = Math.floor((w - 3 * pad) / 2);
    const body = this.face(500, 13.5 * k);
    const bold = this.face(800, 13.5 * k);
    const teamFace = this.face(800, 14 * k);
    const scoreFace = this.face(800, 20 * k);
    const hdr = this.face(600, 9 * k);
    const ty = y + pad + head;
    for (const team of [0, 1] as const) {
      const cx = x + pad + team * (colW + pad);
      this.box(cx, ty, colW, teamH, this.c(team ? 'team_blue_dark' : 'team_red_dark'));
      this.box(cx, ty, colW, Math.max(2, Math.round(3 * k)), this.c(team ? 'team_blue_basic' : 'team_red_basic'));
      this.ftext(teamFace, this.t(team ? 'Blue Team' : 'Red Team'), cx + Math.round(8 * k), ty + Math.round((teamH - teamFace.height) / 2), '#ffffff');
      this.ftext(scoreFace, String(s.scores[team]), cx + colW - Math.round(8 * k), ty + Math.round((teamH - scoreFace.height) / 2), '#ffffff', 'right');
      const fragsX = cx + Math.round(colW * 0.72);
      const pingX = cx + colW - Math.round(8 * k);
      const hy = ty + teamH + Math.round(4 * k);
      this.ftext(hdr, this.t('Frags').toUpperCase(), fragsX, hy, '#888888', 'right');
      this.ftext(hdr, this.t('Ping').toUpperCase(), pingX, hy, '#888888', 'right');
      perTeam[team]!.forEach((pl, j) => {
        const ry = ty + teamH + colH + j * rowH;
        if (pl.me) this.box(cx, ry, colW, rowH, this.c('flag_pole'), 0.08);
        const yy = ry + Math.round((rowH - body.height) / 2);
        if (pl.flagTeam >= 0) this.flagGlyph(cx + Math.round(6 * k), ry + Math.round(6 * k), Math.round(12 * k), pl.flagTeam);
        const nameX = cx + Math.round(22 * k);
        const maxW = fragsX - Math.round(36 * k) - nameX;
        let name = pl.name;
        while (name.length > 1 && body.width(name) > maxW) name = name.slice(0, -1);
        if (name !== pl.name) name = name.slice(0, -1) + '…';
        this.ftext(pl.me ? bold : body, name, nameX, yy, '#eeeeee');
        this.ftext(bold, String(pl.frags), fragsX, yy, '#ffffff', 'right');
        this.ftext(body, String(pl.ping), pingX, yy, '#888888', 'right');
      });
    }
  }

  /** `print_chat_messages`. */
  private drawChat(s: HudState): void {
    const fh = this.fh;
    const { chat, lineH } = s.screen;
    const playfieldY = s.screen.playfield.y;
    let line = 0;
    for (const msg of s.chat) {
      const y = chat.y + line * lineH;
      line++;
      const col = this.chatColour(msg);
      // contorno só sobre a área de jogo (sem textura de fundo, como o `client.cfg` distribuído)
      const border = y + fh >= playfieldY;
      let x = chat.x;
      for (const part of msg.parts) {
        const pc = part.color === 'default' ? col : this.c(`message_${part.color}`);
        this.text(part.text, x, y, pc, { border });
        x += this.fw(part.text);
      }
    }
    if (s.prompt.text) {
      const y = chat.y + line * lineH;
      const col = this.c('message_input');
      this.text(s.prompt.text, chat.x, y, col, { border: true });
      if (s.prompt.cursor >= 0 && Math.trunc(positiveFmod(performance.now() / 500, 2))) {
        const cx = chat.x + this.fw(s.prompt.text.slice(0, s.prompt.cursor));
        this.rect(cx, y, cx + Math.max(1, Math.round(this.k)) - 1, y + fh, col);
      }
    }
  }

  destroy(): void {
    this.faces.destroy();
    this.minimapTexture?.destroy(true);
    this.list.destroy();
    this.stage.destroy({ children: true });
  }
}
