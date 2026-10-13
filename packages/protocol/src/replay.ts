// SPDX-License-Identifier: GPL-2.0-or-later
// Formato do replay (OG-090; equivalente web de REPLAY_VERSION/`record_message`, src/server.cpp:679-760).
// Arquivo: "OGWR" + u32 versão do formato + u32 versão do protocolo + gzip(corpo). Corpo: u32 tamanho +
// cabeçalho JSON + blocos (u32 tamanho + `encodeFrame`): o bloco 0 é o estado inicial, os outros um
// por frame (`replayFrame` + eventos daquele frame). O gzip fica com quem lê/grava (zlib no servidor,
// DecompressionStream no navegador). Spec: plan/specs/replays.md.
import { utf8Decode, utf8Encode } from './codec.js';
import { decodeFrame } from './frame.js';
import type { AnyMessage } from './messages.js';

export const REPLAY_MAGIC = 'OGWR';
/** Sobe quando a estrutura do arquivo muda. */
export const REPLAY_VERSION = 1;

export interface ReplayHeader {
  roomId: string;
  mode: string;
  preset: string;
  /** Arquivo do mapa (sem `.txt`) e título. */
  map: string;
  mapTitle: string;
  maxPlayers: number;
  /** ISO 8601. */
  startedAt: string;
  /** Frame do mundo no início e quantos frames foram gravados. */
  startFrame: number;
  frames: number;
}

export interface Replay {
  version: number;
  protocol: number;
  header: ReplayHeader;
  init: AnyMessage[];
  frames: AnyMessage[][];
}

/** Prefixo sem compressão: magic, versão do formato e do protocolo. */
export function replayPrefix(protocol: number): Uint8Array {
  const out = new Uint8Array(12);
  out.set([...REPLAY_MAGIC].map((c) => c.charCodeAt(0)));
  const view = new DataView(out.buffer);
  view.setUint32(4, REPLAY_VERSION, true);
  view.setUint32(8, protocol, true);
  return out;
}

/** Lê o prefixo; null se não for um replay. */
export function readReplayPrefix(data: Uint8Array): { version: number; protocol: number; body: Uint8Array } | null {
  if (data.length < 12 || String.fromCharCode(...data.subarray(0, 4)) !== REPLAY_MAGIC) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { version: view.getUint32(4, true), protocol: view.getUint32(8, true), body: data.subarray(12) };
}

/** Corpo (antes do gzip): cabeçalho e blocos já codificados. */
export function encodeReplayBody(header: ReplayHeader, chunks: readonly Uint8Array[]): Uint8Array {
  const json = utf8Encode(JSON.stringify(header));
  const out = new Uint8Array(4 + json.length + chunks.reduce((n, c) => n + 4 + c.length, 0));
  const view = new DataView(out.buffer);
  view.setUint32(0, json.length, true);
  out.set(json, 4);
  let at = 4 + json.length;
  for (const c of chunks) {
    view.setUint32(at, c.length, true);
    out.set(c, at + 4);
    at += 4 + c.length;
  }
  return out;
}

/** Decodifica o corpo já descomprimido. */
export function decodeReplayBody(body: Uint8Array, version: number, protocol: number): Replay {
  if (version !== REPLAY_VERSION) throw new Error(`versão de replay não suportada: ${version}`);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const headerLength = view.getUint32(0, true);
  const header = JSON.parse(utf8Decode(body.subarray(4, 4 + headerLength))) as ReplayHeader;
  const chunks: AnyMessage[][] = [];
  for (let at = 4 + headerLength; at < body.length; ) {
    const length = view.getUint32(at, true);
    const r = decodeFrame(body.subarray(at + 4, at + 4 + length), 's2c');
    if (!r.ok) throw new Error(`bloco ${chunks.length} inválido: ${r.error}`);
    chunks.push(r.messages);
    at += 4 + length;
  }
  return { version, protocol, header, init: chunks[0] ?? [], frames: chunks.slice(1) };
}
