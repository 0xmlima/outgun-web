// SPDX-License-Identifier: GPL-2.0-or-later
// Lista de desenho de um quadro (formas, sprites e textos) que reaproveita os objetos do PixiJS.
import { BitmapText, Container, Graphics, Sprite, Texture } from 'pixi.js';

/** Tamanho nativo de cada fonte bitmap: sem ele o PixiJS escala a fonte para o tamanho padrão do estilo (26). */
const FONT_SIZES = new Map<string, number>();

export function registerFontSize(fontFamily: string, size: number): void {
  FONT_SIZES.set(fontFamily, size);
}

/** Filhos de um contêiner na ordem em que são pedidos, reaproveitando objetos entre quadros. */
export class DrawList {
  private readonly sprites: Sprite[] = [];
  private readonly graphics: Graphics[] = [];
  private readonly texts: BitmapText[] = [];
  private si = 0;
  private gi = 0;
  private ti = 0;
  private order: Container[] = [];
  private current: Graphics | null = null;

  constructor(readonly container: Container) {}

  begin(): void {
    this.si = this.gi = this.ti = 0;
    this.order = [];
    this.current = null;
  }

  /** Graphics para formas; consecutivas compartilham o mesmo objeto. */
  g(): Graphics {
    if (this.current) return this.current;
    let g = this.graphics[this.gi];
    if (!g) this.graphics.push((g = new Graphics()));
    this.gi++;
    g.clear();
    g.mask = null;
    g.alpha = 1;
    this.order.push(g);
    this.current = g;
    return g;
  }

  /** Graphics separado (ex.: com máscara própria). */
  separate(): Graphics {
    this.current = null;
    const g = this.g();
    this.current = null;
    return g;
  }

  sprite(texture: Texture, x: number, y: number, size: number, rotation: number, alpha: number): Sprite {
    this.current = null;
    let s = this.sprites[this.si];
    if (!s) {
      this.sprites.push((s = new Sprite()));
      s.anchor.set(0.5);
    }
    this.si++;
    s.texture = texture;
    s.position.set(x, y);
    s.width = size;
    s.height = size;
    s.rotation = rotation;
    s.alpha = alpha;
    s.tint = 0xffffff;
    this.order.push(s);
    return s;
  }

  text(fontFamily: string, text: string, x: number, y: number, tint: string): BitmapText {
    this.current = null;
    let t = this.texts[this.ti];
    if (!t) this.texts.push((t = new BitmapText({ text: '', style: { fontFamily } })));
    this.ti++;
    t.text = text;
    t.style.fontFamily = fontFamily;
    const size = FONT_SIZES.get(fontFamily);
    if (size !== undefined && t.style.fontSize !== size) t.style.fontSize = size;
    t.tint = tint;
    t.position.set(Math.round(x), Math.round(y));
    this.order.push(t);
    return t;
  }

  end(): void {
    this.container.removeChildren();
    if (this.order.length) this.container.addChild(...this.order);
  }

  destroy(): void {
    for (const o of [...this.sprites, ...this.graphics, ...this.texts]) o.destroy();
  }
}
