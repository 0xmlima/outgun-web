// SPDX-License-Identifier: GPL-2.0-or-later
// Carga de mapas no cliente: dos assets do jogo ou, para os que não estão neles (gerados, OG-015, e
// publicados pela moderação, OG-367), do game server em `<base>/maps/<nome>.txt`.
import { decodeMapFile, parseMapFile } from '@outgun/content';
import type { GameMap } from '@outgun/sim';
import { ASSETS, loadManifest } from '../assets.js';

/** Mapa gerado na hora pelo servidor (`random_map`, OG-015). */
export const GENERATED_MAP = /^mapgen_\d+$/;

/** Texto de um mapa baixado: um caractere por byte (Latin-1), como os arquivos do jogo. */
export async function fetchMapText(base: string, name: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${base}/maps/${encodeURIComponent(name)}.txt`);
    return res.ok ? decodeMapFile(new Uint8Array(await res.arrayBuffer())) : undefined;
  } catch {
    return undefined;
  }
}

/** O mapa não está nos assets do jogo (vem do game server)? */
export async function serverOnlyMap(name: string): Promise<boolean> {
  return GENERATED_MAP.test(name) || !(await loadManifest())?.maps[name];
}

/**
 * Mapa pelo nome: dos assets (`maps/`), do texto já recebido (replay) ou baixado do game server
 * (gerado ou da moderação).
 */
export async function loadMap(name: string, source: { text?: string | undefined; base?: string | undefined } = {}): Promise<{ map: GameMap; bytes: Uint8Array }> {
  let bytes: Uint8Array;
  const fromServer = async () => {
    const text = await fetchMapText(source.base!, name);
    if (text === undefined) throw new Error(`mapa não encontrado no servidor: ${name}`);
    return Uint8Array.from(text, (c) => c.charCodeAt(0));
  };
  // texto do replay: um caractere por byte (Latin-1); UTF-8 só se tiver algo fora dele
  if (source.text !== undefined) bytes = /[\u0100-\uffff]/.test(source.text) ? new TextEncoder().encode(source.text) : Uint8Array.from(source.text, (c) => c.charCodeAt(0));
  else if (GENERATED_MAP.test(name) && source.base) bytes = await fromServer();
  else {
    const entry = (await loadManifest())?.maps[name];
    if (entry) bytes = new Uint8Array(await (await fetch(ASSETS + entry.file)).arrayBuffer());
    else if (source.base) bytes = await fromServer();
    else throw new Error(`mapa não encontrado: ${name}`);
  }
  const result = parseMapFile(name, bytes);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return { map: result.map, bytes };
}

/**
 * Mapa a desenhar depois de uma carga: se for o mesmo que a sessão já joga (redesenho pelas cores do
 * clã, OG-409), segue com o objeto dela. O laço de desenho só anda com `session.world.map ===
 * worldMap`; um objeto novo do mesmo mapa congelava a tela até a troca seguinte (OG-509).
 */
export function sameMapOrLoaded(current: GameMap | null | undefined, loaded: GameMap): GameMap {
  return current && current.crc === loaded.crc && current.title === loaded.title && current.width === loaded.width && current.height === loaded.height ? current : loaded;
}
