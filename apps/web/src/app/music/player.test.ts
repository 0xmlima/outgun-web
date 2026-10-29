// SPDX-License-Identifier: GPL-2.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicTrack } from '../../assets.js';
import { MusicPlayer } from './player.js';

const track = (id: string, role: 'menu' | 'match' = 'match'): MusicTrack => ({ id, title: id, role, file: `music/${id}.mp3`, duration: 60, credit: 'x', license: 'CC-BY-SA-4.0' });
const TRACKS = [track('outgun-epic', 'menu'), ...['a', 'b', 'c', 'd'].map((n) => track(n))];

/** `HTMLAudioElement` mínimo: o Node não tem áudio (e sem `AudioContext` o tocador usa `volume`). */
class FakeAudio {
  static all: FakeAudio[] = [];
  src = '';
  preload = '';
  volume = 1;
  paused = true;
  currentTime = 0;
  duration = Number.NaN;
  private listeners: Record<string, (() => void)[]> = {};
  constructor() {
    FakeAudio.all.push(this);
  }
  addEventListener(type: string, fn: () => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  load() {}
  /** Chega ao fim da faixa. */
  finish() {
    for (const fn of this.listeners.ended ?? []) fn();
  }
}

function session(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
}

function started(tracks = TRACKS, flags = session()) {
  const player = new MusicPlayer(() => 0.5, flags);
  player.setTracks(tracks);
  player.setMode('menu');
  player.unlock();
  return player;
}

const audioOf = (id: string) => FakeAudio.all.findLast((a) => a.src.endsWith(`music/${id}.mp3`))!;

describe('tocador da trilha', () => {
  beforeEach(() => {
    FakeAudio.all = [];
    vi.stubGlobal('Audio', FakeAudio);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a primeira vez na sessão abre com o tema; depois rotaciona as outras faixas', () => {
    const flags = session();
    const player = started(TRACKS, flags);
    expect(player.playing).toBe('outgun-epic');
    expect(flags.data['outgun.musicThemePlayed']).toBe('1');
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      audioOf(player.playing!).finish();
      seen.add(player.playing!);
    }
    expect([...seen].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('na mesma sessão (outra página), o menu já começa na rotação', () => {
    const player = started(TRACKS, session({ 'outgun.musicThemePlayed': '1' }));
    expect(player.playing).not.toBe('outgun-epic');
    expect(player.playing).not.toBeNull();
  });

  it('o tema não entra na partida; uma faixa da rotação continua do menu para a partida', () => {
    const player = started();
    player.setMode('match');
    expect(player.playing).not.toBe('outgun-epic');
    const inMatch = player.playing;
    player.setMode('menu');
    expect(player.playing).toBe(inMatch);
    player.setMode('match');
    expect(player.playing).toBe(inMatch);
  });

  it('pausar, retomar e pular para a próxima faixa', () => {
    const player = started();
    const theme = audioOf('outgun-epic');
    player.pause();
    expect(theme.paused).toBe(true);
    expect(player.getState().status).toBe('paused');
    player.resume();
    expect(theme.paused).toBe(false);
    player.skip();
    expect(player.playing).not.toBe('outgun-epic');
    expect(player.getState()).toMatchObject({ status: 'playing', track: { id: player.playing } });
  });

  it('a pausa do menu vale na partida: a faixa da partida não começa a tocar (OG-505)', () => {
    const player = started();
    player.pause();
    player.setMode('match');
    expect(player.playing).not.toBe('outgun-epic');
    expect(audioOf(player.playing as string).paused).toBe(true);
    expect(player.getState().status).toBe('paused');
    player.resume();
    expect(audioOf(player.playing as string).paused).toBe(false);
  });

  it('mudo zera o volume sem parar a faixa; avisa quem observa', () => {
    const player = started();
    const listener = vi.fn();
    player.subscribe(listener);
    player.configure(true, 0.5, true);
    expect(audioOf('outgun-epic').volume).toBe(0);
    expect(audioOf('outgun-epic').paused).toBe(false);
    expect(player.getState().muted).toBe(true);
    expect(listener).toHaveBeenCalled();
    player.configure(true, 0.5, false);
    expect(audioOf('outgun-epic').volume).toBeGreaterThan(0);
  });

  it('antes do primeiro gesto e com a trilha desligada, nada toca', () => {
    const player = new MusicPlayer(() => 0.5, session());
    player.setTracks(TRACKS);
    player.setMode('menu');
    expect(player.getState().status).toBe('locked');
    expect(FakeAudio.all).toHaveLength(0);
    player.configure(false, 0.5);
    player.unlock();
    expect(player.getState().status).toBe('disabled');
    expect(FakeAudio.all).toHaveLength(0);
  });
});
