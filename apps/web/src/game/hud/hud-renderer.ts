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

/** Nome no placar: a coluna tem 15 caracteres; com a tag do clã (OG-206) o que passar vira "...". */
export function scoreboardName(name: string): string {
  return name.length > 15 ? `${name.slice(0, 12)}...` : name;
}

export class HudRenderer {
  readonly stage = new Container();
  private readonly list: DrawList;
  private readonly minimapSprite = new Sprite();
  private minimapKey = '';
  /** Opções do voto desenhadas no último `render` (para o clique). */
  voteTargets: VoteTarget[] = [];
  private minimapTexture: Texture | null = null;

  constructor(
    private readonly theme: RoomTheme,
    private readonly font: GameFont,
    private readonly t: Translate,
    private readonly resolution: number,
  ) {
    const top = new Container();
    this.stage.addChild(this.minimapSprite, top);
    this.list = new DrawList(top);
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

  /** `textout_ex` / `print_text_border`: contorno com a fonte de borda em (x−1, y−1) por caractere. */
  private text(text: string, x: number, y: number, col: string, opts: { centre?: boolean; border?: boolean } = {}): void {
    if (!text) return;
    const x0 = opts.centre ? x - Math.trunc(this.font.width(text) / 2) : x;
    if (opts.border) {
      const borderCol = this.c('text_border');
      let dx = x0;
      for (const ch of text) {
        if (this.font.border) this.list.text(this.font.border.fontFamily, ch, dx - 1, y - 1, borderCol);
        dx += this.font.charWidth(ch);
      }
      if (!this.font.border)
        for (const [i, j] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const) this.list.text(this.font.family, text, x0 + i, y + j, borderCol);
    }
    this.list.text(this.font.family, text, x0, y, col);
  }

  render(s: HudState): void {
    this.list.begin();
    const L = s.screen;
    const fh = this.font.height;
    if (!s.hidden) {
      this.drawMinimap(s);
      this.drawPlayfieldMarks(s);
    } else this.minimapSprite.visible = false;

    if (s.hidden) {
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

    this.drawScoreboard(s);

    // FPS no canto de baixo à direita
    const fps = this.t('FPS:$1', String(Math.trunc(s.fps)).padStart(3, ' '));
    this.text(fps, L.screenW - 2 - this.font.width(fps), L.screenH - fh - 2, this.c('fps'));

    if (s.mapTime) {
      const sec = Math.max(0, s.mapTime.seconds);
      const str = `${s.mapTime.extra ? this.t('ET') + ' ' : ''}${Math.trunc(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      this.text(str, L.timeX - this.font.width(str), L.timeY, this.c('map_time'));
    }

    if (s.self) {
      const pups = [
        ['Power', s.self.power, 'power'],
        ['Turbo', s.self.turbo, 'turbo'],
        ['Shadow', s.self.shadow, 'shadow'],
      ] as const;
      pups.forEach(([caption, val, col], line) => {
        if (val <= 0) return;
        const y = L.indicatorsY + line * (fh + 2);
        this.text(this.t(caption), L.pupsX, y, this.c(col));
        const v = String(iround(val)).padStart(3, ' ');
        this.text(v, L.pupsValX - this.font.width(v), y, this.c(col));
      });
      this.text(this.t('Weapon $1', String(s.self.weapon)), L.weaponX, L.indicatorsY, this.c('weapon'));
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
      this.drawBar(s, L.healthX, this.t('Health'), s.self.health, 'health');
      this.drawBar(s, L.energyX, this.t('Energy'), s.self.energy, 'energy');
    }

    this.drawChat(s);
    this.drawPause(s);

    if (s.notResponding) {
      // `m_notResponding`: caixa no meio da tela
      const lines = [this.t('Server not responding'), this.t('May be heavy packet loss,'), this.t('or the server disconnected.')];
      const w = Math.max(...lines.map((l) => this.font.width(l))) + 20;
      const h = lines.length * (fh + 4) + 12;
      const x = Math.trunc((L.screenW - w) / 2);
      const y = Math.trunc((L.screenH - h) / 2);
      this.rect(x, y, x + w, y + h, this.c('menu_background'));
      this.rect(x, y, x + w, y + fh + 6, this.c('menu_caption_bg'));
      lines.forEach((l, i) => this.text(l, x + 10, y + 4 + i * (fh + 4) + (i ? 6 : 0), this.c(i ? 'menu_value' : 'menu_caption')));
    }
    this.list.end();
  }

  /** Overlay da pausa (OG-264): mesma caixa e cores do "Server not responding", no centro da área de jogo. */
  private drawPause(s: HudState): void {
    this.voteTargets = [];
    const p = s.pause;
    if (!p) return;
    const L = s.screen;
    const fh = this.font.height;
    const lineH = fh + 4;
    const body = [p.detail, ...(p.options?.map((o) => o.label) ?? []), p.hint ?? '', p.footer].filter((l) => l !== '');
    const w = Math.max(this.font.width(p.title), ...body.map((l) => this.font.width(l))) + 20;
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
    const fh = this.font.height;
    const y = L.indicatorsY;
    const col = this.c('bar_text');
    this.text(caption, x, y, col);
    const val = String(value).padStart(3, ' ');
    const width = scaleBy(L.mul, 100);
    const valX = Math.max(x + this.font.width(caption) + this.font.width(' '), x + width - this.font.width(val));
    this.text(val, valX, y, col);
    const y1 = y + Math.trunc((3 * fh) / 2);
    const y2 = L.screenH - 5;
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
    const font = this.font;
    if (!L.scoreboard) {
      // sem placar (tela cheia): só o placar dos times embaixo do relógio
      const [r, b] = s.scores;
      const col = r > b ? this.c('team_red_light') : r < b ? this.c('team_blue_light') : this.c('game_draw');
      const str = `${r} - ${b}`;
      this.text(str, L.timeX - font.width(str), L.timeY + font.height, col);
      return;
    }
    const { x1, y1, x2, y2 } = L.scoreboard;
    const placeW = x2 - x1 + 1;
    const ySpace = y2 - y1 + 1;
    const lines = 2 + s.maxPlayers + 1;
    const characters = 20;
    const charW = font.width('M');
    const width = characters * charW;
    const sbx = placeW > width ? x1 + Math.trunc((placeW - width) / 2) : x1;
    const nSpacers = 3;
    let spacer = 3;
    let lineH = Math.trunc((ySpace - nSpacers * spacer) / lines);
    if (lineH > font.height) {
      spacer = font.height + 2;
      lineH = Math.trunc((ySpace - nSpacers * spacer) / lines);
      if (lineH > 2 * font.height) lineH = 2 * font.height;
    }
    spacer += Math.trunc((ySpace - nSpacers * spacer - lineH * lines) / nSpacers);
    if (spacer > 15) spacer = 15;
    const half = s.maxPlayers / 2;
    const teamY = [y1 + spacer, y1 + spacer + (1 + half) * lineH + spacer];
    let hpad = 6;
    if (sbx - x1 < hpad) hpad = Math.max(1, sbx - x1 - 2);
    const vpad = Math.max(Math.trunc((lineH - font.height) / 2), 1);
    const bx1 = sbx - hpad;
    const bx2 = sbx + width + hpad;
    const bg = [this.c('scoreboard_bg_redteam'), this.c('scoreboard_bg_blueteam')];
    const lineCol = [this.c('scoreboard_line_redteam'), this.c('scoreboard_line_blueteam')];
    const dark = [this.c('team_red_dark'), this.c('team_blue_dark')];
    for (const i of [0, 1] as const) {
      const ty = teamY[i] as number;
      this.rect(bx1 + 1, ty + lineH - vpad + 1, bx2 - 1, ty + (half + 1) * lineH - vpad - 1, bg[i] as string);
      this.rect(bx1 + 1, ty - vpad + 1, bx2 - 1, ty + lineH - vpad - 1, dark[i] as string);
      this.hline(bx1 + 1, ty - vpad, bx2 - 1, lineCol[i] as string);
      for (let j = 1; j <= half + 1; j++) this.hline(bx1 + 1, ty + j * lineH - vpad, bx2 - 1, lineCol[i] as string);
      this.vline(bx1, ty - vpad, ty + (half + 1) * lineH - vpad, lineCol[i] as string);
      this.vline(sbx + (characters - 3) * charW - 5, ty + lineH - vpad, ty + (half + 1) * lineH - vpad, lineCol[i] as string);
      this.vline(bx2, ty - vpad, ty + (half + 1) * lineH - vpad, lineCol[i] as string);
      const name = this.t(i === 0 ? 'Red Team' : 'Blue Team');
      const right = s.showPings ? this.t('pings') : this.t('$1 capt', String(s.scores[i]).padStart(3, ' '));
      const caption = name + right.padStart(Math.max(right.length, characters - name.length), ' ');
      this.text(caption, sbx, ty, this.c(i === 0 ? 'scoreboard_caption_redteam' : 'scoreboard_caption_blueteam'));
    }
    const line = [1, 1];
    for (const p of s.players) {
      const pc = Number.parseInt(this.c(PLAYER_COLOURS[p.color] ?? 'player_unknown').slice(1), 16);
      const light = (v: number) => 40 + Math.trunc((v * 215) / 255);
      const textCol = `#${[16, 8, 0].map((sh) => light((pc >> sh) & 255).toString(16).padStart(2, '0')).join('')}`;
      const y = (teamY[p.team] as number) + (line[p.team] as number) * lineH;
      // `draw_scoreboard_name`: sublinha quem tem conta (opção, ligada no client.cfg distribuído)
      const shown = scoreboardName(p.name);
      if (s.underlineAccounts && p.account) this.hline(sbx + 8, y + this.font.height, sbx + 8 + font.width(shown) - 2, textCol);
      this.text(shown, sbx + 8, y, textCol);
      const pts = String(s.showPings ? p.ping : p.frags);
      this.text(pts, sbx + 20 * charW - font.width(pts), y, this.teamLight(p.team));
      if (p.flagTeam >= 0) {
        const flag = Math.trunc(charW / 2);
        const pole = Math.trunc((7 * flag) / 4);
        const fy = y + Math.trunc((font.height - pole) / 2);
        this.vline(sbx, fy, fy + pole, this.c('flag_pole'));
        this.rect(sbx + 1, fy, sbx + 1 + flag, fy + flag, this.teamCol(p.flagTeam));
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

  /** `print_chat_messages`. */
  private drawChat(s: HudState): void {
    const fh = this.font.height;
    const lineH = fh + 3;
    const margin = 3;
    const playfieldY = s.screen.playfield.y;
    let line = 0;
    for (const msg of s.chat) {
      const y = margin + line * lineH;
      line++;
      let col: string;
      const teamName = msg.team === 0 ? 'redteam' : msg.team === 1 ? 'blueteam' : 'unknown';
      if (msg.type === 'warning') col = this.c('message_warning');
      else if (msg.type === 'team') col = this.c(`team_message_${teamName}`);
      else if (msg.type === 'info') col = this.c('message_info');
      else if (msg.type === 'header') col = this.c('message_header');
      else if (msg.type === 'server' || msg.type === 'admin') col = this.c('message_server');
      else col = this.c(`normal_message_${teamName}`);
      // contorno só sobre a área de jogo (sem textura de fundo, como o `client.cfg` distribuído)
      const border = y + fh >= playfieldY;
      let x = margin;
      for (const part of msg.parts) {
        const pc = part.color === 'default' ? col : this.c(`message_${part.color}`);
        this.text(part.text, x, y, pc, { border });
        x += this.font.width(part.text);
      }
    }
    if (s.prompt.text) {
      const y = margin + line * lineH;
      const col = this.c('message_input');
      this.text(s.prompt.text, margin, y, col, { border: true });
      if (s.prompt.cursor >= 0 && Math.trunc(positiveFmod(performance.now() / 500, 2))) {
        const cx = margin + this.font.width(s.prompt.text.slice(0, s.prompt.cursor));
        this.vline(cx, y, y + fh, col);
      }
    }
  }

  destroy(): void {
    this.minimapTexture?.destroy(true);
    this.list.destroy();
    this.stage.destroy({ children: true });
  }
}
