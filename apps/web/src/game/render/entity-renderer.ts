// SPDX-License-Identifier: GPL-2.0-or-later
// Entidades e efeitos sobre as salas: port de `GuiClient::draw_playfield` e das funções `draw_*` de
// src/graphics.cpp (plan/specs/render-entidades.md). Sprites do tema quando existem; senão as
// formas procedurais do original.
import { Container, Graphics, Texture } from 'pixi.js';
import { DrawList } from './draw-list.js';
import { ROOM_HEIGHT, ROOM_WIDTH, type WorldCoords } from '@outgun/sim';
import {
  blink30,
  carrierCircleAlpha,
  deathbringerBrightness,
  explosionColour,
  FLAG_SPRITE_SIZE,
  gunAngle,
  GUNPOINT_RADIUS,
  healthVariation,
  hex,
  hitColour,
  ITEM_SPRITE_SIZE,
  PLAYER_RADIUS,
  PLAYER_SPRITE_SIZE,
  POWER_ROCKET_RADIUS,
  powerBlink,
  rgb,
  ROCKET_RADIUS,
  ROCKET_SPRITE_SIZE,
  shadowItemAlpha,
  SHIELD_RADIUS_ADD,
  smoke,
  weaponItemAngle,
  type EffectKind,
  type EntityFrame,
  type FlagView,
  type PlayerView,
} from './entity-frame.js';
import { pfScale, roomOffsetsX, roomOffsetsY, type RoomLayout } from './layout.js';
import type { EntitySprites } from './sprites.js';
import { colour, type RoomTheme } from './theme.js';

interface Effect {
  readonly kind: EffectKind | 'smoke' | 'turbo';
  readonly pos: WorldCoords;
  readonly time: number;
  readonly team: number;
  readonly alpha: number;
  readonly player?: PlayerView;
}

const random = Math.random;

export class EntityRenderer {
  readonly stage = new Container();
  private readonly clip = new Graphics();
  private readonly list: DrawList;
  private readonly roomMasks: Graphics[] = [];
  private effects: Effect[] = [];
  private readonly nextTurbo = new Map<number, number>();
  private readonly nextSmoke = new Map<number, number>();
  private readonly shieldJitter = [0, 0, 0, 0, 0, 0];
  private readonly turboJitter = [0, 0, 0, 0, 0, 0];
  private carrierTexture: { size: number; texture: Texture } | null = null;
  private layout!: RoomLayout;
  private topLeft!: WorldCoords;

  constructor(
    private readonly theme: RoomTheme,
    private readonly sprites: EntitySprites,
    /** Fonte bitmap instalada no PixiJS para nomes e contagens; `null` = sem texto. */
    private readonly font: { family: string; height: number } | null,
  ) {
    const content = new Container();
    this.stage.addChild(content, this.clip);
    content.mask = this.clip;
    this.list = new DrawList(content);
  }

  /** Efeito criado por evento (foguete acertou jogador ou parede). */
  addEffect(kind: EffectKind, pos: WorldCoords, team: number, time: number): void {
    this.effects.push({ kind, pos, time, team, alpha: 1 });
  }

  private c(name: string): string {
    return colour(this.theme, name);
  }

  private pf(v: number): number {
    return pfScale(this.layout, v);
  }

  private pfd(v: number): number {
    return this.layout.scale * v;
  }

  /** Pontos da tela onde `pos` aparece (`ScaledCoordSet`). */
  private at(pos: WorldCoords): [number, number][] {
    const xs = roomOffsetsX(this.layout, this.topLeft, pos.room.x);
    const ys = roomOffsetsY(this.layout, this.topLeft, pos.room.y);
    const out: [number, number][] = [];
    for (const x of xs) for (const y of ys) out.push([x + this.pf(pos.x), y + this.pf(pos.y)]);
    return out;
  }

  private onScreen(pos: WorldCoords, margin: number): boolean {
    const m = this.pfd(margin);
    return this.at(pos).some(([x, y]) => x + m >= this.layout.x0 && x - m < this.layout.x0 + this.layout.width && y + m >= this.layout.y0 && y - m < this.layout.y0 + this.layout.height);
  }

  render(frame: EntityFrame, layout: RoomLayout, topLeft: WorldCoords): void {
    this.layout = layout;
    this.topLeft = topLeft;
    this.clip.clear().rect(layout.x0, layout.y0, layout.width, layout.height).fill(0xffffff);
    const t = frame.time;
    const L = this.list;
    L.begin();
    for (const mask of this.roomMasks) mask.clear(); // máscara sem uso desenharia um retângulo
    this.effects = this.effects.filter((fx) => t - fx.time >= 0 && t - fx.time <= 0.6);

    // 1. mortos
    for (const p of frame.players) if (p.dead && this.onScreen(p.pos, PLAYER_SPRITE_SIZE)) this.drawDead(p);
    // 3. power-ups (e a fumaça do deathbringer no chão)
    for (const pup of frame.powerups) if (this.onScreen(pup.pos, 60)) this.drawPowerup(pup.kind, pup.pos, t);
    // 4. rastros de turbo
    for (const fx of this.effects) if (fx.kind === 'turbo' && fx.player && t - fx.time <= 0.3) this.drawPlayerBody(fx.player, fx.pos, t, Math.trunc(fx.alpha * (90 - (t - fx.time) * 300)), true);
    // 5. bandeiras no chão
    for (const f of frame.flags) if (f.carrier === -1 && this.onScreen(f.pos, 120)) this.drawFlag(f, 255, frame.multiRoom);
    // 6. foguetes
    for (const r of frame.rockets) if (this.onScreen(r.pos, 34)) this.drawRocket(r.team, r.power, r.pos, r.direction, r.shadow, t);
    // 7. jogadores: o próprio time primeiro, o próprio jogador por último
    const me = frame.players.find((p) => p.me);
    const order = frame.players.filter((p) => !p.dead && !p.me).sort((a, b) => (me && a.team !== b.team ? (a.team === me.team ? -1 : 1) : a.pid - b.pid));
    if (me && !me.dead) order.push(me);
    for (const p of order) if (this.onScreen(p.pos, 120)) this.drawPlayer(p, frame, t);
    // 8. anel do portador do deathbringer
    for (const p of order) if (p.deathbringer && this.onScreen(p.pos, PLAYER_SPRITE_SIZE)) this.drawCarrierCircle(p);
    // 9. efeitos
    for (const fx of this.effects) this.drawEffect(fx, t);
    // 10. explosões de deathbringer
    frame.deathbringers.forEach((db, i) => this.drawDeathbringer(db.pos, db.team, db.radius, i));
    // 12. nomes
    if (this.font) for (const p of order) if (p.alpha >= 200 || (me && p.team === me.team)) this.drawName(p);
    L.end();
  }

  private drawDead(p: PlayerView): void {
    const L = this.list;
    const iceCream = p.frags >= 100 && p.frags % 100 === 0;
    for (const [x, y] of this.at(p.pos)) {
      if (iceCream) {
        if (this.sprites.iceCream) L.sprite(this.sprites.iceCream, x, y, this.pfd(PLAYER_SPRITE_SIZE), 0, 1);
        else {
          const g = L.g();
          g.ellipse(x, y, this.pf(6), this.pf(15)).fill(this.c('ice_cream_crisp'));
          g.circle(x - this.pf(8), y - this.pf(10), this.pfd(8)).fill(this.c('ice_cream_ball_1'));
          g.circle(x + this.pf(8), y - this.pf(10), this.pfd(8)).fill(this.c('ice_cream_ball_2'));
          g.circle(x, y - this.pf(20), this.pfd(8)).fill(this.c('ice_cream_ball_3'));
          if (this.font && this.pf(100) >= 50) {
            L.text(this.font.family, 'VIROU', x, y - this.pf(38) - 10, this.c('ice_cream_text')).anchor.set(0.5, 0);
            L.text(this.font.family, 'SORVETE!', x, y - this.pf(38), this.c('ice_cream_text')).anchor.set(0.5, 0);
          }
        }
      } else if (this.sprites.dead) {
        L.sprite(this.sprites.dead[p.team]!, x, y, this.pfd(PLAYER_SPRITE_SIZE), gunAngle(p.gundir < 0 ? 0 : p.gundir), 1);
      } else {
        const s = this.pf(PLAYER_RADIUS * 10);
        const fill = { color: this.c(p.team === 0 ? 'blood_redteam' : 'blood_blueteam'), alpha: 90 / 255 };
        const g = L.g();
        g.ellipse(x - Math.trunc(s / 25), y + Math.trunc(s / 20), Math.trunc(s / 9), Math.trunc(s / 10)).fill(fill);
        g.ellipse(x, y - Math.trunc(s / 30), Math.trunc(s / 8), Math.trunc(s / 10)).fill(fill);
        g.ellipse(x + Math.trunc(s / 50), y + Math.trunc(s / 40), Math.trunc(s / 8), Math.trunc(s / 10)).fill(fill);
      }
      if (p.respawnIn > 0) this.timer(String(Math.trunc(p.respawnIn)), x, y, this.c('name_highlight'));
    }
  }

  private timer(text: string, x: number, y: number, tint: string): void {
    if (!this.font) return;
    const L = this.list;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const)
      L.text(this.font.family, text, x + dx, y + dy, this.c('timer_border')).anchor.set(0.5, 0);
    L.text(this.font.family, text, x, y, tint).anchor.set(0.5, 0);
  }

  private drawPowerup(kind: number, pos: WorldCoords, t: number): void {
    const L = this.list;
    const sprite = this.sprites.pup[kind];
    if (sprite) {
      for (const [x, y] of this.at(pos)) L.sprite(sprite, x, y, this.pfd(ITEM_SPRITE_SIZE), 0, 1);
      return;
    }
    switch (kind) {
      case 0: // shield
        this.drawShield(pos, 14, -1, 255, 0);
        for (const [x, y] of this.at(pos)) L.g().circle(x, y, this.pfd(12)).fill(this.c('pup_shield'));
        return;
      case 1: {
        // turbo: três círculos tremendo
        const j = this.turboJitter;
        [3, 4, 6].forEach((a, i) => {
          j[i] = Math.trunc(random() * 2 * a) - a;
          j[i + 3] = Math.trunc(random() * 2 * a) - a;
        });
        for (const [x, y] of this.at(pos))
          for (let i = 0; i < 3; i++) L.g().circle(x + this.pf(j[i]!), y + this.pf(j[i + 3]!), this.pfd(12)).fill(this.c(`pup_turbo_${i + 1}`));
        return;
      }
      case 2:
        for (const [x, y] of this.at(pos)) L.g().circle(x, y, this.pfd(12)).fill({ color: this.c('pup_shadow'), alpha: shadowItemAlpha(t) / 255 });
        return;
      case 3:
        for (const [x, y] of this.at(pos))
          if (blink30(t)) L.g().circle(x, y, this.pfd(13)).fill(this.c('pup_power_1'));
          else L.g().circle(x, y, this.pfd(11)).fill(this.c('pup_power_2'));
        return;
      case 4:
        for (let b = 0; b < 4; b++) {
          const deg = weaponItemAngle(t, b);
          for (const [x, y] of this.at(pos)) L.g().circle(x + this.pf(10 * Math.cos(deg)), y + this.pf(10 * Math.sin(deg)), this.pfd(4)).fill(this.c(`pup_weapon_${b + 1}`));
        }
        return;
      case 5: {
        const v = healthVariation(t);
        const item = this.pf(11 + v);
        const cross = this.pf(8 + v);
        const width = this.pf(3);
        const border = Math.max(1, this.pf(2));
        for (const [x, y] of this.at(pos)) {
          const g = L.g();
          g.rect(x - item - border, y - item - border, 2 * (item + border) + 1, 2 * (item + border) + 1).fill(this.c('pup_health_border'));
          g.rect(x - item, y - item, 2 * item + 1, 2 * item + 1).fill(this.c('pup_health_bg'));
          g.rect(x - cross, y - width, 2 * cross + 1, 2 * width + 1).fill(this.c('pup_health_cross'));
          g.rect(x - width, y - cross, 2 * width + 1, 2 * cross + 1).fill(this.c('pup_health_cross'));
        }
        return;
      }
      case 6:
        for (const [x, y] of this.at(pos)) L.g().circle(x, y, this.pfd(12)).fill(this.c('pup_deathbringer'));
        this.addSmoke(pos, -1, 255, t, true);
        return;
    }
  }

  /** `create_deathbringer_smoke`: posição sorteada perto do item ou do portador. */
  private addSmoke(pos: WorldCoords, team: number, alpha: number, time: number, forItem: boolean): void {
    const dx = forItem ? Math.trunc(random() * 30) - 15 : Math.trunc(random() * 40) - 20;
    const dy = forItem ? Math.trunc(random() * 30) - 5 : Math.trunc(random() * 40);
    this.effects.push({ kind: 'smoke', pos: { room: pos.room, x: pos.x + dx, y: pos.y + dy }, time, team, alpha: alpha / 255 });
  }

  private drawShield(pos: WorldCoords, r: number, team: number, alpha: number, direction: number): void {
    const L = this.list;
    const sprite = team === 0 || team === 1 ? this.sprites.shield?.[team] : undefined;
    if (sprite) {
      for (const [x, y] of this.at(pos)) L.sprite(sprite, x, y, this.pfd(PLAYER_SPRITE_SIZE), gunAngle(direction), alpha / 255);
      return;
    }
    const rr = this.pf(r);
    const v = [this.pf(2) + 1, this.pf(4) + 1, this.pf(8) + 1];
    for (let i = 0; i < 3; i++) {
      this.shieldJitter[i] = Math.trunc(random() * v[i]!);
      this.shieldJitter[i + 3] = Math.trunc(random() * v[i]!);
    }
    const base = team === 0 || team === 1 ? rgb(this.c(team === 0 ? 'team_red_basic' : 'team_blue_basic')) : null;
    for (const [x, y] of this.at(pos)) {
      const g = L.g();
      for (let i = 0; i < 3; i++) {
        const col = base ? hex(base.map((c) => c + Math.trunc(random() * (256 - c))) as [number, number, number]) : hex([0, 0, 0].map(() => Math.trunc(random() * 256)) as [number, number, number]);
        g.ellipse(x, y, rr + this.shieldJitter[i]!, rr + this.shieldJitter[i + 3]!).stroke({ color: col, width: 1, alpha: alpha / 255 });
      }
    }
  }

  private drawFlag(f: FlagView, alpha: number, multiRoom: boolean): void {
    const L = this.list;
    const team = this.c(['team_red_basic', 'team_blue_basic', 'wild_flag'][f.team]!);
    const flash = this.c(['team_red_flash', 'team_blue_flash', 'wild_flag_flash'][f.team]!);
    const sprite = (f.flash ? this.sprites.flagFlash : this.sprites.flag)?.[f.team];
    for (const [x, y] of this.at(f.pos)) {
      if (multiRoom && !f.flash) {
        // ênfase: quatro triângulos apontando para a bandeira
        const a = this.pf(20);
        const d = [-a, 3 * a, a, 3 * a, 0, 2 * a];
        const g = L.g();
        for (let i = 0; i < 4; i++) {
          const rev = i & 1;
          const mul = 1 - (i & 2);
          g.poly([x + mul * d[0 + rev]!, y + mul * d[1 - rev]!, x + mul * d[2 + rev]!, y + mul * d[3 - rev]!, x + mul * d[4 + rev]!, y + mul * d[5 - rev]!]).fill({ color: team, alpha: alpha / 255 });
        }
      }
      if (sprite) L.sprite(sprite, x, y, this.pfd(FLAG_SPRITE_SIZE), 0, alpha / 255);
      else {
        const g = L.g();
        g.rect(x - this.pf(3), y - this.pf(20), 2 * this.pf(3) + 1, 2 * this.pf(20) + 1).fill({ color: this.c('flag_pole'), alpha: alpha / 255 });
        g.rect(x, y - this.pf(18), this.pf(20) + 1, this.pf(18) + 1).fill({ color: f.flash ? flash : team, alpha: alpha / 255 });
      }
      if (f.returnIn >= 3) this.timer(String(Math.trunc(f.returnIn)), x, y, team);
    }
  }

  private drawRocket(team: 0 | 1, power: boolean, pos: WorldCoords, direction: number, shadow: boolean, t: number): void {
    const L = this.list;
    const sprite = (power ? this.sprites.powerRocket : this.sprites.rocket)?.[team];
    for (const [x, y] of this.at(pos)) {
      if (sprite) {
        L.sprite(sprite, x, y, this.pfd(ROCKET_SPRITE_SIZE), gunAngle(direction), 1);
        continue;
      }
      const g = L.g();
      const r = power ? POWER_ROCKET_RADIUS : ROCKET_RADIUS;
      if (shadow) g.ellipse(x, y + this.pf(r + 8), this.pf(r), this.pf(power ? 3 : 2)).fill(this.c('rocket_shadow'));
      const fill = !power ? this.c(team === 0 ? 'team_red_basic' : 'team_blue_basic') : blink30(t) ? this.c('power_rocket') : this.c(team === 0 ? 'team_red_light' : 'team_blue_light');
      g.circle(x, y, this.pfd(r)).fill(fill);
    }
  }

  /** Corpo do jogador (`Graphics::draw_player`); também usado pelos rastros de turbo. */
  private drawPlayerBody(p: PlayerView, pos: WorldCoords, t: number, alpha: number, trail: boolean): void {
    if (alpha <= 0) return;
    const L = this.list;
    let pc1 = this.c(p.team === 0 ? 'team_red_basic' : 'team_blue_basic');
    let pc2 = p.color >= 16 ? this.c('player_unknown') : this.c(`player${String(p.color + 1).padStart(2, '0')}`);
    const hit = trail ? null : hitColour(this.c('player_hit'), p.hitfx, t);
    const power = !trail && p.power && powerBlink(t);
    if (hit) pc1 = pc2 = hit;
    else if (power) {
      pc1 = this.c('player_power_team');
      pc2 = this.c('player_power_personal');
    }
    let sprite: Texture | null = null;
    if (p.gundir >= 0 && p.color < 16) sprite = power && this.sprites.playerPower ? this.sprites.playerPower : (this.sprites.player?.[p.team]?.[p.color] ?? null);
    for (const [x, y] of this.at(pos)) {
      if (sprite) {
        const s = L.sprite(sprite, x, y, this.pfd(PLAYER_SPRITE_SIZE), gunAngle(p.gundir), alpha / 255);
        if (hit) s.tint = hit; // o original troca as cores; com sprite, tinge
        continue;
      }
      const g = L.g();
      const a = alpha / 255;
      const R = this.pf(PLAYER_RADIUS);
      g.circle(x, y, R).fill({ color: pc1, alpha: a });
      g.circle(x, y, (R * 2) / 3).fill({ color: pc2, alpha: a });
      if (p.gundir >= 0) {
        const ang = gunAngle(p.gundir);
        const gdx = Math.cos(ang);
        const gdy = Math.sin(ang);
        const xg0 = this.pf(gdx * PLAYER_RADIUS);
        const xg1 = this.pf(gdx * GUNPOINT_RADIUS);
        const yg0 = this.pf(gdy * PLAYER_RADIUS);
        const yg1 = this.pf(gdy * GUNPOINT_RADIUS);
        const offsets = [
          [0, 0],
          [Math.trunc((gdy - gdx) * 1.3), Math.trunc((-gdx - gdy) * 1.3)],
          [Math.trunc((-gdy - gdx) * 1.3), Math.trunc((gdx - gdy) * 1.3)],
        ];
        for (const [ox, oy] of offsets) g.moveTo(x + xg0 + ox! + 0.5, y + yg0 + oy! + 0.5).lineTo(x + xg1 + ox! + 0.5, y + yg1 + oy! + 0.5);
        g.stroke({ color: pc1, width: 1, alpha: a });
      }
    }
  }

  private drawPlayer(p: PlayerView, frame: EntityFrame, t: number): void {
    const carried = frame.flags.find((f) => f.carrier === p.pid);
    if (carried) this.drawFlag({ ...carried, pos: p.pos }, 255, frame.multiRoom);
    if (p.turboTrail && t > (this.nextTurbo.get(p.pid) ?? 0)) {
      this.nextTurbo.set(p.pid, t + 0.05);
      this.effects.push({ kind: 'turbo', pos: p.pos, time: t, team: p.team, alpha: p.alpha / 255, player: { ...p, hitfx: 0, power: false } });
    }
    this.drawPlayerBody(p, p.pos, t, p.alpha, false);
    if (p.deathbringer && t > (this.nextSmoke.get(p.pid) ?? 0)) {
      this.nextSmoke.set(p.pid, t + 0.01);
      this.addSmoke(p.pos, p.team, p.alpha, t, false);
      this.addSmoke(p.pos, p.team, p.alpha, t, false);
    }
    if (p.deathbringerAffected) {
      const a = p.alpha / 2 / 255;
      for (const [x, y] of this.at(p.pos)) {
        const g = this.list.g();
        for (let i = 0; i < 10; i++)
          g.circle(x + this.pf(Math.trunc(random() * 40) - 20), y + this.pf(Math.trunc(random() * 40) - 20), this.pfd(15)).fill({ color: i < 5 ? this.c(p.team === 0 ? 'team_red_basic' : 'team_blue_basic') : this.c('deathbringer_affected'), alpha: a });
      }
    }
    if (p.shield) this.drawShield(p.pos, PLAYER_RADIUS + SHIELD_RADIUS_ADD, p.team, p.alpha, p.gundir < 0 ? 0 : p.gundir);
  }

  /** Disco escuro com alfa radial em volta do portador (`make_db_effect`), em cache por tamanho. */
  private drawCarrierCircle(p: PlayerView): void {
    const size = Math.max(1, 2 * this.pf(2 * PLAYER_RADIUS));
    if (this.carrierTexture?.size !== size) {
      this.carrierTexture?.texture.destroy(true);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(size, size);
      const [r, g, b] = rgb(this.c('deathbringer_carrier_circle'));
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          img.data[i] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
          img.data[i + 3] = carrierCircleAlpha(Math.hypot(size / 2 - x, size / 2 - y), size);
        }
      ctx.putImageData(img, 0, 0);
      this.carrierTexture = { size, texture: Texture.from(canvas) };
    }
    for (const [x, y] of this.at(p.pos)) this.list.sprite(this.carrierTexture.texture, x, y, size, 0, p.alpha / 255);
  }

  private drawEffect(fx: Effect, t: number): void {
    const delta = t - fx.time;
    if (!this.onScreen(fx.pos, 120)) return;
    const teamCol = this.c(['team_red_basic', 'team_blue_basic', 'wild_flag'][fx.team] ?? 'wild_flag');
    const rings = (count: number, speed: number, life: number) => {
      if (delta > life) return;
      for (let e = 0; e < count; e++) {
        const rad = 4 + e + Math.trunc(delta * speed);
        const col = explosionColour(teamCol, random);
        for (const [x, y] of this.at(fx.pos)) this.list.g().circle(x, y, this.pfd(rad)).stroke({ color: col, width: 1 });
      }
    };
    switch (fx.kind) {
      case 'gunExplosion':
        return rings(3, 40, 0.4);
      case 'wallExplosion':
        return rings(2, 40, 0.2);
      case 'powerWallExplosion':
        return rings(3, 60, 0.2);
      case 'smoke': {
        const s = smoke(delta, fx.alpha);
        if (s.alpha <= 0) return;
        const col = this.c(fx.team === 0 ? 'deathbringer_smoke_red' : fx.team === 1 ? 'deathbringer_smoke_blue' : 'deathbringer_smoke');
        for (const [x, y] of this.at(fx.pos)) this.list.g().circle(x, y - this.pf(s.rise), this.pfd(s.radius)).fill({ color: col, alpha: s.alpha / 255 });
        return;
      }
      case 'turbo':
        return;
    }
  }

  /** Anel da explosão de deathbringer, recortado na sala (`draw_deathbringer`). */
  private drawDeathbringer(pos: WorldCoords, team: 0 | 1, radiusWorld: number, index: number): void {
    const radius = this.pfd(radiusWorld);
    const lx = this.pf(pos.x);
    const ly = this.pf(pos.y);
    const maxX = Math.max(lx, this.pf(ROOM_WIDTH) - lx);
    const maxY = Math.max(ly, this.pf(ROOM_HEIGHT) - ly);
    if (maxX * maxX + maxY * maxY < radius * radius) return;
    const scale = this.pfd(1);
    const width = this.pfd(40);
    const xs = roomOffsetsX(this.layout, this.topLeft, pos.room.x);
    const ys = roomOffsetsY(this.layout, this.topLeft, pos.room.y);
    let m = 0;
    for (const rx of xs)
      for (const ry of ys) {
        const g = this.list.separate();
        let mask = this.roomMasks[index * 4 + m];
        if (!mask) {
          this.roomMasks[index * 4 + m] = mask = new Graphics();
          this.stage.addChild(mask);
        }
        m++;
        mask.clear().rect(rx, ry, this.pf(ROOM_WIDTH), this.pf(ROOM_HEIGHT)).fill(0xffffff);
        g.mask = mask;
        // anéis concêntricos de 1 px com o brilho do original
        for (let r = 0; r < width; r += 1) {
          const b = Math.max(0, Math.min(255, deathbringerBrightness(r, scale)));
          g.circle(rx + lx, ry + ly, radius + r + 0.5).stroke({ color: team === 0 ? hex([b, 0, 0]) : hex([0, 0, b]), width: 1.2 });
        }
      }
  }

  private drawName(p: PlayerView): void {
    if (!this.font) return;
    const dark = this.c(p.team === 0 ? 'team_red_dark' : 'team_blue_dark');
    const tint = this.c(p.me ? 'name_highlight' : 'name');
    for (const [x, y] of this.at(p.pos)) {
      const ty = y - this.pf((3 * PLAYER_RADIUS) / 2) - this.font.height;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) this.list.text(this.font.family, p.name, x + dx, ty + dy, dark).anchor.set(0.5, 0);
      this.list.text(this.font.family, p.name, x, ty, tint).anchor.set(0.5, 0);
    }
  }

  destroy(): void {
    this.list.destroy();
    this.carrierTexture?.texture.destroy(true);
    this.stage.destroy({ children: true });
  }
}
