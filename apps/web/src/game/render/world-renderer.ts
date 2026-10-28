// SPDX-License-Identifier: GPL-2.0-or-later
// Fundo da área de jogo no PixiJS: cada sala é pintada uma vez (room-painter, num worker) e vira
// uma textura em cache, como o `BackgroundManager` do original (src/graphics.cpp:3472-3600). As
// salas vizinhas da vista são pré-pintadas para a troca de sala não derrubar quadros.
import { ImageSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { WorldCoords } from '@outgun/sim';
import { roomLayout, visibleRooms, type Rect, type RoomLayout } from './layout.js';
import { FLAGPOS_RADIUS, roomTransform } from './room-painter.js';
import type { RoomSource } from './room-source.js';
import { colour, type RoomTheme } from './theme.js';

/** `playfieldFogOfWarAlpha` (src/graphics.h:569). */
const FOG_ALPHA = 0x38 / 255;
/** Emblema do clã no chão da base (OG-486): diâmetro em unidades do mundo e opacidade do decalque. */
const DECAL_SIZE = 5 * FLAGPOS_RADIUS;
const DECAL_ALPHA = 0.26;

/** Um ponto de bandeira de uma base (sala e posição dentro dela). */
export interface DecalSpot {
  readonly room: { readonly x: number; readonly y: number };
  readonly x: number;
  readonly y: number;
}

export interface WorldViewOptions {
  readonly visibleRooms: number;
  readonly continuousTextures: boolean;
  readonly repeatX?: boolean;
  readonly repeatY?: boolean;
  /** "Map info mode" (OG-070): repinta as salas com respawn, spawn e grade. */
  readonly mapInfo?: boolean;
}

interface CachedRoom {
  texture: Texture | null;
  lastUse: number;
}

export class WorldRenderer {
  readonly stage = new Container();
  private readonly rooms = new Container();
  /** Emblemas no chão das bases (OG-486): por cima das salas, por baixo da névoa e das entidades. */
  private readonly decals = new Container();
  private readonly decalSprites: Sprite[] = [];
  private decalSpots: { spot: DecalSpot; texture: Texture }[] = [];
  /** Salas ainda não pintadas aparecem na cor do chão. */
  private readonly placeholders = new Graphics();
  private readonly fog = new Graphics();
  private readonly clip = new Graphics();
  private readonly cache = new Map<string, CachedRoom>();
  private readonly sprites: Sprite[] = [];
  private layoutValue: RoomLayout | undefined;
  private continuous = true;
  private mapInfo = false;
  /** Muda a cada troca de layout: pinturas de um layout antigo são descartadas. */
  private generation = 0;
  private frame = 0;
  private lastViewKey = '';

  constructor(
    private readonly mapW: number,
    private readonly mapH: number,
    private readonly theme: RoomTheme,
    private readonly source: RoomSource,
    private readonly resolution: number,
  ) {
    this.stage.addChild(this.placeholders, this.rooms, this.decals, this.fog, this.clip);
    this.stage.mask = this.clip;
  }

  get layout(): RoomLayout | undefined {
    return this.layoutValue;
  }

  /** Recalcula o layout para a área de jogo; descarta o cache se o tamanho das salas mudar. */
  setPlayfield(playfield: Rect, opts: WorldViewOptions): RoomLayout {
    const layout = roomLayout(playfield, this.mapW, this.mapH, opts.visibleRooms, opts.repeatX, opts.repeatY);
    const old = this.layoutValue;
    if (!old || old.roomW !== layout.roomW || old.roomH !== layout.roomH || this.continuous !== opts.continuousTextures || this.mapInfo !== (opts.mapInfo ?? false))
      this.invalidate();
    this.layoutValue = layout;
    this.continuous = opts.continuousTextures;
    this.mapInfo = opts.mapInfo ?? false;
    this.clip.clear().rect(layout.x0, layout.y0, layout.width, layout.height).fill(0xffffff);
    this.lastViewKey = '';
    return layout;
  }

  /** Emblema de cada lado nos pontos de bandeira das bases dele; textura null = lado sem emblema. */
  setDecals(teams: readonly { readonly spots: readonly DecalSpot[]; readonly texture: Texture | null }[]): void {
    this.decalSpots = teams.flatMap(({ spots, texture }) => (texture ? spots.map((spot) => ({ spot, texture })) : []));
  }

  /**
   * Desenha as salas vistas a partir de `topLeft`; `fogged(rx, ry)` marca salas sem informação.
   * Devolve quantas salas na tela ainda esperam a pintura.
   */
  render(topLeft: WorldCoords, fogged: (rx: number, ry: number) => boolean = () => false): number {
    const layout = this.layoutValue;
    if (!layout) return 0;
    let missing = 0;
    this.frame++;
    const placements = visibleRooms(layout, topLeft);
    this.placeholders.clear();
    this.fog.clear();
    placements.forEach((p, i) => {
      let sprite = this.sprites[i];
      if (!sprite) {
        sprite = new Sprite();
        this.sprites.push(sprite);
        this.rooms.addChild(sprite);
      }
      const texture = this.room(p.rx, p.ry, true);
      sprite.visible = texture !== null;
      if (texture) {
        sprite.texture = texture;
        sprite.position.set(p.x, p.y);
      } else {
        sprite.texture = Texture.EMPTY;
        this.placeholders.rect(p.x, p.y, layout.roomW, layout.roomH);
        missing++;
      }
      if (fogged(p.rx, p.ry)) this.fog.rect(p.x, p.y, layout.roomW, layout.roomH);
    });
    for (let i = placements.length; i < this.sprites.length; i++) {
      const sprite = this.sprites[i]!;
      sprite.visible = false;
      sprite.texture = Texture.EMPTY; // a textura pode sair do cache (`evict`)
    }
    // decalques: posição dentro da sala pelo mesmo enquadramento da pintura (`roomTransform`)
    let n = 0;
    if (this.decalSpots.length) {
      const rt = roomTransform(layout.roomW, layout.roomH);
      const size = DECAL_SIZE * rt.scale;
      for (const p of placements)
        for (const { spot, texture } of this.decalSpots) {
          if (spot.room.x !== p.rx || spot.room.y !== p.ry) continue;
          let s = this.decalSprites[n];
          if (!s) {
            s = new Sprite();
            s.anchor.set(0.5);
            s.alpha = DECAL_ALPHA;
            this.decalSprites.push(s);
            this.decals.addChild(s);
          }
          s.texture = texture;
          s.visible = true;
          s.width = s.height = size;
          s.position.set(p.x + rt.x0 + spot.x * rt.scale, p.y + rt.y0 + spot.y * rt.scale);
          n++;
        }
    }
    for (let i = n; i < this.decalSprites.length; i++) this.decalSprites[i]!.visible = false;
    this.placeholders.fill(colour(this.theme, 'ground'));
    this.fog.fill({ color: colour(this.theme, 'playfield_fog'), alpha: FOG_ALPHA });

    // Vista nova: pré-pinta a moldura de salas em volta e libera as que ficaram longe.
    const viewKey = `${topLeft.room.x},${topLeft.room.y}`;
    if (viewKey !== this.lastViewKey) {
      this.lastViewKey = viewKey;
      const xs = Math.ceil(layout.visibleX) + 2;
      const ys = Math.ceil(layout.visibleY) + 2;
      for (let dx = -1; dx < xs - 1; dx++)
        for (let dy = -1; dy < ys - 1; dy++)
          this.room(((topLeft.room.x + dx) % this.mapW + this.mapW) % this.mapW, ((topLeft.room.y + dy) % this.mapH + this.mapH) % this.mapH, false);
      this.evict(Math.min(this.mapW, xs) * Math.min(this.mapH, ys));
    }
    return missing;
  }

  /** Textura da sala, se já pintada; senão pede a pintura e devolve `null`. */
  private room(rx: number, ry: number, urgent: boolean): Texture | null {
    const layout = this.layoutValue!;
    const key = `${rx},${ry}`;
    let entry = this.cache.get(key);
    if (entry) {
      entry.lastUse = this.frame;
      if (!entry.texture && urgent) this.source.promote(rx, ry);
      return entry.texture;
    }
    entry = { texture: null, lastUse: this.frame };
    this.cache.set(key, entry);
    const generation = this.generation;
    const created = entry;
    const width = Math.round(layout.roomW * this.resolution);
    const height = Math.round(layout.roomH * this.resolution);
    this.source
      .paint(rx, ry, { width, height, texelSize: this.resolution, texRoomX: this.continuous ? rx : 0, texRoomY: this.continuous ? ry : 0, mapInfo: this.mapInfo }, urgent)
      .then((image) => {
        if (generation !== this.generation || this.cache.get(key) !== created) {
          if ('close' in image) image.close();
          return;
        }
        created.texture = new Texture({
          source: new ImageSource({ resource: image, resolution: this.resolution, scaleMode: 'nearest' }),
        });
      })
      .catch(() => {
        if (this.cache.get(key) === created) this.cache.delete(key); // tenta de novo no próximo quadro
      });
    return null;
  }

  /** Mantém no máximo `keep` salas, descartando as usadas há mais tempo. */
  private evict(keep: number): void {
    if (this.cache.size <= keep) return;
    const entries = [...this.cache.entries()].sort((a, b) => a[1].lastUse - b[1].lastUse);
    for (const [key, entry] of entries.slice(0, this.cache.size - keep)) {
      if (entry.lastUse === this.frame) continue;
      entry.texture?.destroy(true);
      this.cache.delete(key);
    }
  }

  /** Esquece as salas desenhadas (tamanho, tema ou opção de texturas mudou). */
  invalidate(): void {
    this.generation++;
    this.source.cancelPending();
    // nenhum sprite fica com textura destruída até o próximo `render` (o Pixi quebra em `alphaMode`, OG-278)
    for (const sprite of this.sprites) {
      sprite.texture = Texture.EMPTY;
      sprite.visible = false;
    }
    for (const entry of this.cache.values()) entry.texture?.destroy(true);
    this.cache.clear();
  }

  destroy(): void {
    this.invalidate();
    this.source.destroy();
    this.stage.destroy({ children: true });
  }
}
