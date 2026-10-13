// SPDX-License-Identifier: GPL-2.0-or-later
// Tema gráfico das salas: cores (de fábrica + `colours.txt` do tema) e texturas de chão e parede
// (src/graphics.cpp:2870-2922, plan/specs/render-salas.md).
import { ASSETS, loadImage, type Manifest } from '../../assets.js';

/** IDs 0..7 das texturas de chão (RN-MAP-04). */
export const FLOOR_TEXTURES = [
  'floor_normal1',
  'floor_normal2',
  'floor_normal3',
  'floor_red',
  'floor_blue',
  'floor_ice',
  'floor_sand',
  'floor_mud',
] as const;

/** IDs 0..7 das texturas de parede (RN-MAP-04). */
export const WALL_TEXTURES = [
  'wall_normal1',
  'wall_normal2',
  'wall_normal3',
  'wall_red',
  'wall_blue',
  'wall_metal',
  'wall_wood',
  'wall_rubber',
] as const;

/** Uma textura do tema (imagem) ou, na falta dela, uma cor sólida. */
export type Fill = { readonly kind: 'texture'; readonly image: CanvasImageSource } | { readonly kind: 'solid'; readonly colour: string };

export interface RoomTheme {
  /** Nome do tema (`''` = sem tema, como o `<no theme>` do original). */
  readonly name: string;
  readonly colours: Readonly<Record<string, string>>;
  readonly floor: readonly Fill[];
  readonly wall: readonly Fill[];
  /** Quais IDs têm imagem própria no tema (os outros caem na textura 0 ou na cor sólida). */
  readonly ownFloor: readonly boolean[];
  readonly ownWall: readonly boolean[];
}

/** Cor do tema; preto se nem o tema nem as cores de fábrica a definem. */
export function colour(theme: RoomTheme, name: string): string {
  return theme.colours[name] ?? '#000000';
}

/** Cores de fábrica com as do `colours.txt` do tema por cima. */
export function themeColours(
  defaults: Readonly<Record<string, string>>,
  themeColours: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  return { ...defaults, ...themeColours };
}

/**
 * Textura `i` do tema; se faltar, a 0; se faltar a 0, a cor sólida (`get_floor_texture` e o
 * `backupTexture` de `drawRoomBackground`).
 */
export function resolveFills(images: readonly (CanvasImageSource | null)[], solid: string): Fill[] {
  const backup: Fill = images[0] ? { kind: 'texture', image: images[0] } : { kind: 'solid', colour: solid };
  return images.map((image) => (image ? { kind: 'texture', image } : backup));
}

/**
 * Tema de cores (`Colour theme` + `Prefer main theme colours`, OG-068): as do tema principal se ele
 * tiver e a preferência estiver marcada; senão as do tema de cores; senão nenhuma (as de fábrica).
 */
export function pickColourTheme(manifest: Manifest, main: string, colourTheme: string, preferMain: boolean): Readonly<Record<string, string>> | undefined {
  const mainColours = main ? manifest.graphics[main]?.colours : undefined;
  if (preferMain && mainColours) return mainColours;
  return (colourTheme ? manifest.graphics[colourTheme]?.colours : undefined) ?? undefined;
}

/** Carrega o tema `name` (`''` = sem tema: só cores) com o tema de cores escolhido. */
export async function loadRoomTheme(manifest: Manifest, name: string, colourTheme = '', preferMainColours = true): Promise<RoomTheme> {
  const entry = name ? manifest.graphics[name] : undefined;
  const colours = themeColours(manifest.defaultColours, pickColourTheme(manifest, name, colourTheme, preferMainColours));
  const load = (file: string): Promise<HTMLImageElement | null> => {
    const graphic = entry?.graphics[file];
    return graphic ? loadImage(ASSETS + graphic.file).catch(() => null) : Promise.resolve(null);
  };
  const [floor, wall] = await Promise.all([
    Promise.all(FLOOR_TEXTURES.map(load)),
    Promise.all(WALL_TEXTURES.map(load)),
  ]);
  return {
    name: entry ? name : '',
    colours,
    floor: resolveFills(floor, colours.ground ?? '#000000'),
    wall: resolveFills(wall, colours.wall ?? '#000000'),
    ownFloor: floor.map((image) => image !== null),
    ownWall: wall.map((image) => image !== null),
  };
}
