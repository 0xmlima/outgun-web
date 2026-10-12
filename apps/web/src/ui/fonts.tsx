// SPDX-License-Identifier: GPL-2.0-or-later
// Carrega o manifesto de assets (`pnpm assets`, OG-012/013) e as fontes bitmap sob demanda. Sem os
// assets (ex.: build de CI), os textos caem para a fonte CSS do tema.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ASSETS, loadImage, loadManifest } from '../assets.js';
import { parseFnt, type BitmapFontData } from './bitmap-font.js';

export interface LoadedFont {
  readonly data: BitmapFontData;
  readonly image: HTMLImageElement;
}

const fontPromises = new Map<string, Promise<LoadedFont | null>>();

function loadFont(name: string): Promise<LoadedFont | null> {
  let promise = fontPromises.get(name);
  if (!promise) {
    promise = loadManifest().then(async (manifest) => {
      const files = manifest?.fonts[name]?.font;
      if (!files) return null;
      const [text, image] = await Promise.all([
        fetch(ASSETS + files.fnt).then((res) => res.text()),
        loadImage(ASSETS + files.png),
      ]);
      return { data: parseFnt(text), image };
    });
    promise = promise.catch(() => null);
    fontPromises.set(name, promise);
  }
  return promise;
}

/** Nomes das fontes disponíveis no manifesto (vazio sem assets). */
export function useFontNames(): readonly string[] {
  const [names, setNames] = useState<readonly string[]>([]);
  useEffect(() => {
    let alive = true;
    void loadManifest().then((m) => alive && setNames(m ? Object.keys(m.fonts) : []));
    return () => {
      alive = false;
    };
  }, []);
  return names;
}

const FontContext = createContext<LoadedFont | null>(null);

/** Disponibiliza a fonte `name` para os `BitmapText` abaixo; enquanto carrega, usa a fonte CSS. */
export function FontProvider({ name, children }: { name: string; children: ReactNode }) {
  const [font, setFont] = useState<LoadedFont | null>(null);
  useEffect(() => {
    let alive = true;
    void loadFont(name).then((loaded) => alive && setFont(loaded));
    return () => {
      alive = false;
    };
  }, [name]);
  return <FontContext value={font}>{children}</FontContext>;
}

export function useMenuFont(): LoadedFont | null {
  return useContext(FontContext);
}
