// SPDX-License-Identifier: GPL-2.0-or-later
// Mapas .txt enviados pela moderação (OG-366, D-70): validados pelo mesmo parser do jogo (formato do
// original) antes de publicar. O texto fica em Latin-1 (um caractere = um byte), como os arquivos do
// jogo: o game server e o cliente leem os mesmos bytes e chegam ao mesmo CRC.
import { parseMap } from '@outgun/content';

/** Nome do arquivo (sem `.txt`), o mesmo usado nas rotações. */
export const MAP_NAME = /^[A-Za-z0-9][A-Za-z0-9 _().,'+-]{0,63}$/;
export const MAP_MAX_BYTES = 64 * 1024;

export interface MapPreview {
  title: string;
  author: string;
  width: number;
  height: number;
  crc: number;
}

/** Problemas do nome: formato e nomes reservados (mapas gerados e `random_map`). */
export function mapNameProblem(name: string): string | undefined {
  if (!MAP_NAME.test(name)) return 'name: letters, digits, spaces and _().,\'+- only, up to 64 characters';
  if (/^mapgen_\d+$/.test(name) || name.startsWith('random_map')) return 'name: reserved';
  return undefined;
}

/** Valida o texto de um mapa: tamanho, Latin-1 e o parser do jogo (erros com a linha). */
export function checkMapText(text: string): { ok: true; map: MapPreview } | { ok: false; errors: string[] } {
  if (text.length === 0) return { ok: false, errors: ['empty file'] };
  if (text.length > MAP_MAX_BYTES) return { ok: false, errors: [`file over ${MAP_MAX_BYTES / 1024} KB`] };
  if (/[\u0100-\uffff]/.test(text)) return { ok: false, errors: ['characters outside Latin-1 (save the file as ANSI/Latin-1 or plain ASCII)'] };
  const r = parseMap(text);
  if (!r.ok) return { ok: false, errors: [...r.errors] };
  return { ok: true, map: { title: r.map.title, author: r.map.author, width: r.map.width, height: r.map.height, crc: r.map.crc } };
}
