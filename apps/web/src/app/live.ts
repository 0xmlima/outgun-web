// SPDX-License-Identifier: GPL-2.0-or-later
// Portal ao vivo (OG-284): uma conexão só (`GET /api/live`, Server-Sent Events) para todas as telas.
// O servidor avisa o tópico que mudou (`rooms`, `matches`, `notifications`) e quem estiver inscrito
// relê o endpoint de sempre. As consultas periódicas continuam como reserva: com o canal de pé
// ficam lentas (`LIVE_FALLBACK_MS`); caído, voltam ao ritmo normal sem nada aparecer na tela.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { API_URL } from './api.js';

export type LiveTopic = 'rooms' | 'matches' | 'notifications';
const TOPICS: readonly LiveTopic[] = ['rooms', 'matches', 'notifications'];
/** Consulta de reserva enquanto o canal está de pé. */
export const LIVE_FALLBACK_MS = 60_000;

const listeners = new Map<LiveTopic, Set<() => void>>();
const statusListeners = new Set<() => void>();
let source: EventSource | null = null;
let connected = false;
let users = 0;

function setConnected(on: boolean): void {
  if (connected === on) return;
  connected = on;
  for (const l of statusListeners) l();
}

function open(): void {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource(`${API_URL}/live`, { withCredentials: true });
  source.addEventListener('hello', () => setConnected(true));
  source.addEventListener('error', () => setConnected(false)); // o EventSource tenta de novo sozinho
  for (const topic of TOPICS) source.addEventListener(topic, () => listeners.get(topic)?.forEach((l) => l()));
}

function close(): void {
  source?.close();
  source = null;
  setConnected(false);
}

/** Troca de conta (entrar/sair): reabre para o servidor saber de quem são as notificações. */
export function reconnectLive(): void {
  if (!source) return;
  close();
  open();
}

/** O canal está de pé (para as telas escolherem o ritmo da consulta de reserva). */
export function useLiveConnected(): boolean {
  return useSyncExternalStore(
    (l) => {
      statusListeners.add(l);
      return () => void statusListeners.delete(l);
    },
    () => connected,
    () => false,
  );
}

/** Chama `onChange` a cada aviso do tópico (sem tópico, não inscreve). */
export function useLive(topic: LiveTopic | null, onChange: () => void): void {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    if (!topic) return;
    const l = () => ref.current();
    if (!listeners.has(topic)) listeners.set(topic, new Set());
    listeners.get(topic)!.add(l);
    users++;
    open();
    return () => {
      listeners.get(topic)?.delete(l);
      if (--users === 0) close();
    };
  }, [topic]);
}

/** Intervalo da consulta de reserva: o normal com o canal caído, o lento com ele de pé. */
export const fallbackMs = (everyMs: number, live: boolean) => (live ? Math.max(everyMs, LIVE_FALLBACK_MS) : everyMs);
