// SPDX-License-Identifier: GPL-2.0-or-later
// Manifesto dos assets convertidos (`pnpm assets`, tools/asset-pipeline) servidos em /assets/.

export const ASSETS = '/assets/';

export interface FontFiles {
  readonly fnt: string;
  readonly png: string;
}

export interface GraphicEntry {
  readonly file: string;
  readonly kind: string;
  readonly width: number;
  readonly height: number;
}

export interface Manifest {
  readonly graphics: Readonly<
    Record<
      string,
      {
        readonly graphics: Readonly<Record<string, GraphicEntry>>;
        readonly colours?: Readonly<Record<string, string>>;
      }
    >
  >;
  readonly fonts: Readonly<Record<string, { readonly font: FontFiles; readonly border?: FontFiles }>>;
  /** Temas de som: arquivo de cada sample (null = o tema não tem). */
  readonly sounds: Readonly<Record<string, { readonly name: string; readonly samples: Readonly<Record<string, string | null>> }>>;
  readonly defaultColours: Readonly<Record<string, string>>;
  readonly maps: Readonly<Record<string, { readonly file: string; readonly dir: 'maps' | 'cmaps' }>>;
}

let manifestPromise: Promise<Manifest | null> | undefined;

/** O manifesto, ou `null` se os assets não foram gerados. */
export function loadManifest(): Promise<Manifest | null> {
  manifestPromise ??= fetch(`${ASSETS}manifest.json`)
    .then((res) => (res.ok ? (res.json() as Promise<Manifest>) : null))
    .catch(() => null);
  return manifestPromise;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`falha ao carregar ${src}`));
    img.src = src;
  });
}
