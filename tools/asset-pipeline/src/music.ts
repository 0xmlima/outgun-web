// SPDX-License-Identifier: GPL-2.0-or-later
// Trilha sonora da v2 (OG-220, D-38): as faixas de `songs/` vão para a web como estão (MP3 de ~190
// kbps, 48 kHz), com hash no nome; o manifesto lista título, artista, álbum e ano (das tags ID3),
// papel e duração. Sem recodificar: o
// cliente baixa uma faixa por vez, sob demanda (RN-MUS-05), e o pipeline não depende do ffmpeg.

/** Faixa do menu (RN-MUS-01); as demais tocam nas partidas (RN-MUS-02). */
export const MENU_TRACK = 'outgun-epic';
export const MUSIC_CREDIT = 'Thiago Anuszkiewicz';
/** Licença das faixas (D-38; songs/LICENSE.txt). */
export const MUSIC_LICENSE = 'CC-BY-SA-4.0';

export interface MusicTrack {
  /** Do nome do arquivo (`Outgun 2-2.mp3` → `outgun-2-2`): faixas distintas podem ter o mesmo título nos metadados. */
  id: string;
  /** Da tag ID3 (TIT2); sem ela, do nome do arquivo. */
  title: string;
  /** Tags ID3 TPE1, TALB e TYER/TDRC, quando houver. */
  artist?: string;
  album?: string;
  year?: string;
  role: 'menu' | 'match';
  file: string;
  /** Segundos, com uma casa decimal. */
  duration: number;
  credit: string;
  /** Identificador SPDX. */
  license: string;
}

export function trackId(fileName: string): string {
  return fileName
    .replace(/\.mp3$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** `Outgun epic.mp3` → `Outgun Epic`. */
export function trackTitle(fileName: string): string {
  return fileName
    .replace(/\.mp3$/i, '')
    .trim()
    .replace(/(^|\s)(\p{Ll})/gu, (_, space: string, letter: string) => space + letter.toUpperCase());
}

const BITRATES = {
  // kbps por índice: MPEG-1 camada III e MPEG-2/2.5 camada III
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] } as Record<number, number[]>;

interface Frame {
  length: number;
  samples: number;
  sampleRate: number;
}

/** Cabeçalho de quadro MPEG camada III em `offset`, ou null. */
function frameAt(bytes: Uint8Array, offset: number): Frame | null {
  if (offset + 4 > bytes.length) return null;
  const b1 = bytes[offset + 1]!;
  const b2 = bytes[offset + 2]!;
  if (bytes[offset] !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const version = (b1 >> 3) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
  const layer = (b1 >> 1) & 3; // 1 = camada III
  if (version === 1 || layer !== 1) return null;
  const bitrate = (version === 3 ? BITRATES.v1 : BITRATES.v2)[(b2 >> 4) & 15];
  const sampleRate = SAMPLE_RATES[version]?.[(b2 >> 2) & 3];
  if (!bitrate || !sampleRate) return null;
  const padding = (b2 >> 1) & 1;
  const samples = version === 3 ? 1152 : 576;
  return { length: Math.floor(((samples / 8) * bitrate * 1000) / sampleRate) + padding, samples, sampleRate };
}

/** Quadro sem áudio no início (cabeçalho Xing/Info/VBRI dos codificadores). */
function isInfoFrame(bytes: Uint8Array, offset: number, length: number): boolean {
  const text = String.fromCharCode(...bytes.subarray(offset, Math.min(offset + length, offset + 64)));
  return /Xing|Info|VBRI/.test(text);
}

/** Duração em segundos, somando os quadros (vale para CBR e VBR); pula a tag ID3v2. */
export function mp3Duration(bytes: Uint8Array): number {
  let offset = 0;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6]! & 0x7f) << 21) | ((bytes[7]! & 0x7f) << 14) | ((bytes[8]! & 0x7f) << 7) | (bytes[9]! & 0x7f);
    offset = 10 + size + (bytes[5]! & 0x10 ? 10 : 0);
  }
  let seconds = 0;
  let first = true;
  while (offset < bytes.length) {
    const frame = frameAt(bytes, offset);
    if (!frame) {
      offset++; // lixo ou tag no meio: procura o próximo sincronismo
      continue;
    }
    if (!(first && isInfoFrame(bytes, offset, frame.length))) seconds += frame.samples / frame.sampleRate;
    first = false;
    offset += frame.length;
  }
  return seconds;
}

export interface Id3Tags {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
}

const ID3_FRAMES: Record<string, keyof Id3Tags> = { TIT2: 'title', TPE1: 'artist', TALB: 'album', TYER: 'year', TDRC: 'year' };

/** Texto de um quadro ID3v2 (byte de encoding + conteúdo). */
function id3Text(bytes: Uint8Array): string {
  const body = bytes.subarray(1);
  let text: string;
  switch (bytes[0]) {
    case 1: // UTF-16 com BOM
    case 2: // UTF-16BE (v2.4)
      text = new TextDecoder(bytes[0] === 2 || (body[0] === 0xfe && body[1] === 0xff) ? 'utf-16be' : 'utf-16le').decode(body);
      break;
    case 3:
      text = new TextDecoder('utf-8').decode(body);
      break;
    default:
      text = String.fromCharCode(...body);
  }
  return text.replace(/^\uFEFF/, '').replace(/\0[\s\S]*$/, '').trim();
}

const syncsafe = (b: Uint8Array, i: number) => ((b[i]! & 0x7f) << 21) | ((b[i + 1]! & 0x7f) << 14) | ((b[i + 2]! & 0x7f) << 7) | (b[i + 3]! & 0x7f);

/** Título, artista, álbum e ano da tag ID3v2.3/2.4 do início do arquivo (vazio se não houver). */
export function id3Tags(bytes: Uint8Array): Id3Tags {
  const tags: Id3Tags = {};
  if (!(bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)) return tags;
  const version = bytes[3]!;
  if (version !== 3 && version !== 4) return tags;
  const end = Math.min(bytes.length, 10 + syncsafe(bytes, 6));
  let offset = 10;
  if (bytes[5]! & 0x40) offset += version === 4 ? syncsafe(bytes, 10) : 4 + ((bytes[10]! << 24) | (bytes[11]! << 16) | (bytes[12]! << 8) | bytes[13]!);
  while (offset + 10 <= end && bytes[offset] !== 0) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = version === 4 ? syncsafe(bytes, offset + 4) : ((bytes[offset + 4]! << 24) | (bytes[offset + 5]! << 16) | (bytes[offset + 6]! << 8) | bytes[offset + 7]!) >>> 0;
    const key = ID3_FRAMES[id];
    if (key && size > 1) {
      const text = id3Text(bytes.subarray(offset + 10, Math.min(end, offset + 10 + size)));
      if (text) tags[key] = key === 'year' ? text.slice(0, 4) : text;
    }
    offset += 10 + size;
  }
  return tags;
}
