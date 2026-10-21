// SPDX-License-Identifier: GPL-2.0-or-later
// Chat (OG-046, RN-CHT-01/02): anti-flood só para rajadas extremas (D-60, OG-335; o original bloqueava
// na 3ª mensagem seguida e descartava caractere repetido), `formatDuration` (src/utility.cpp:551) e o
// filtro de palavras (novo).
import { foldAccents } from '@outgun/protocol';

/** max_chat_message_length (src/commont.h:54). */
export const MAX_CHAT_LENGTH = 200;

/** Mensagens numa rajada que bloqueiam o chat (D-60: só o flood extremo). */
export const FLOOD_LIMIT = 30;
/** O bloqueio acaba quando a conta esfria até aqui (~10 s depois do bloqueio). */
const FLOOD_RELEASE = FLOOD_LIMIT - 10;

/**
 * "Temperatura" da conversa de um jogador (D-60, revê a RN-CHT-02 do original): cada mensagem soma 1 e
 * esfria 0,1 por frame (uma mensagem por segundo nunca acumula); passar de `FLOOD_LIMIT` bloqueia até
 * esfriar a `FLOOD_RELEASE`. Tentativas durante o bloqueio não esquentam, então ele sempre acaba.
 */
export class TalkMeter {
  temp = 0;
  blocked = false;

  /** Uma vez por frame do servidor (também no lobby, na pausa e entre mapas). */
  cool(): void {
    this.temp = Math.max(0, this.temp - 0.1);
    if (this.blocked && this.temp <= FLOOD_RELEASE) this.blocked = false;
  }

  /** Conta uma mensagem; true = "too much talk" (a mensagem é descartada). */
  speak(): boolean {
    if (this.blocked) return true;
    this.temp += 1;
    if (this.temp > FLOOD_LIMIT) this.blocked = true;
    return this.blocked;
  }
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
