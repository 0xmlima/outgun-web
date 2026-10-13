// SPDX-License-Identifier: GPL-2.0-or-later
// Chat (OG-046, RN-CHT-01/02): anti-flood como `Server::chat` (src/server.cpp:1480-1494) e o
// resfriamento em `simulatePlayerPrePhysics` (src/world.cpp:3126-3132), `isFlood`
// (src/commont.cpp:202), `formatDuration` (src/utility.cpp:551) e o filtro de palavras (novo).
import { foldAccents } from '@outgun/protocol';

/** max_chat_message_length (src/commont.h:54). */
export const MAX_CHAT_LENGTH = 200;

/** "Temperatura" da conversa de um jogador. */
export class TalkMeter {
  temp = 0;
  hotness = 1;

  /** Uma vez por frame. */
  cool(): void {
    this.temp = Math.max(0, this.temp - 0.1);
    this.hotness = Math.max(1, this.hotness - 0.1);
  }

  /** Conta uma mensagem; true = "too much talk" (a mensagem é descartada). */
  speak(): boolean {
    this.temp += this.hotness;
    this.hotness += 3;
    if (this.temp > 18) this.temp = 18;
    if (this.hotness > 6) this.hotness = 6;
    if (this.temp > 10) {
      this.temp = 18;
      return true;
    }
    return false;
  }
}

/** Mesmo caractere 7 vezes seguidas. */
export function isFlood(message: string): boolean {
  let count = 0;
  let chr = '';
  for (const ch of message) {
    if (ch !== chr) {
      chr = ch;
      count = 1;
    } else if (++count === 7) return true;
  }
  return false;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `formatDuration` em inglês (as respostas do console do servidor são em inglês, como no original). */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  let minutes = Math.trunc(seconds / 60);
  seconds %= 60;
  if (minutes < 60) return `${minutes}:${pad(seconds)} minutes`;
  let hours = Math.trunc(minutes / 60);
  minutes %= 60;
  if (hours < 24) return `${hours}:${pad(minutes)}:${pad(seconds)} hours`;
  const days = Math.trunc(hours / 24);
  hours %= 24;
  return `${days} ${days === 1 ? 'day' : 'days'} ${hours}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Filtro de palavras (novo, opcional por sala): troca por `*` as palavras da lista, sem diferenciar
 * maiúsculas nem acentos. Palavra = sequência de letras e dígitos.
 */
export function censor(text: string, words: ReadonlySet<string>): string {
  if (words.size === 0) return text;
  return text.replace(/[\p{L}\p{N}]+/gu, (word) => (words.has(foldAccents(word).toLowerCase()) ? '*'.repeat(word.length) : word));
}

/** Lista de palavras normalizada para `censor`. */
export function wordSet(words: Iterable<string>): Set<string> {
  return new Set([...words].map((w) => foldAccents(w.trim()).toLowerCase()).filter(Boolean));
}
