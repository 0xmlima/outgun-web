// SPDX-License-Identifier: GPL-2.0-or-later
// Trilha sonora (OG-221): um tocador só, vivo entre as rotas, separado dos efeitos do jogo. Cada faixa
// toca num `HTMLAudioElement` (streaming: não decodifica minutos de áudio na memória); o Web Audio só
// faz o ganho e o crossfade. Nada é baixado antes do primeiro gesto do jogador (autoplay) nem com a
// trilha desligada (RN-MUS-03, RN-MUS-05).
import { ASSETS, type MusicTrack } from '../../assets.js';
import { matchTracks, menuTrack, Playlist } from './playlist.js';

/** O que deve tocar: o tema do menu, a playlist das partidas ou nada (Ranked, replay; D-37). */
export type MusicMode = 'menu' | 'match' | 'off';

/** Duração do crossfade entre faixas e ao entrar/sair da partida. */
export const FADE_SECONDS = 2.5;
/** A música fica abaixo dos efeitos: o volume escolhido é multiplicado por isto. */
export const MUSIC_MIX = 0.6;

interface Deck {
  readonly track: MusicTrack;
  readonly audio: HTMLAudioElement;
  readonly gain: GainNode | null;
  ending: boolean;
}

export class MusicPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private current: Deck | null = null;
  private tracks: readonly MusicTrack[] = [];
  private playlist: Playlist;
  private mode: MusicMode = 'off';
  private enabled = true;
  private volume = 0.5;
  private unlocked = false;

  constructor(private readonly rng: () => number = Math.random) {
    this.playlist = new Playlist([], rng);
  }

  setTracks(tracks: readonly MusicTrack[]): void {
    this.tracks = tracks;
    this.playlist = new Playlist(matchTracks(tracks), this.rng);
    this.update();
  }

  setMode(mode: MusicMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.update();
  }

  /** Liga/desliga e volume 0..1 (OG-222). */
  configure(enabled: boolean, volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.master) this.master.gain.value = this.volume * MUSIC_MIX;
    if (this.current && !this.current.gain) this.current.audio.volume = this.volume * MUSIC_MIX;
    if (enabled !== this.enabled) {
      this.enabled = enabled;
      this.update();
    }
  }

  /** Primeiro gesto do jogador: o navegador libera o áudio. */
  unlock(): void {
    if (!this.unlocked) {
      this.unlocked = true;
      this.update();
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  /** Faixa tocando agora (para testes e depuração). */
  get playing(): string | null {
    return this.current?.track.id ?? null;
  }

  private wanted(): MusicTrack | undefined {
    if (!this.enabled || !this.unlocked) return undefined;
    if (this.mode === 'menu') return menuTrack(this.tracks);
    if (this.mode === 'match') {
      // trocas de mapa e idas ao menu do jogo não interrompem a faixa da partida
      if (this.current?.track.role === 'match' && !this.current.ending) return this.current.track;
      return this.playlist.next();
    }
    return undefined;
  }

  private update(): void {
    const next = this.wanted();
    if (next && next.id === this.current?.track.id && !this.current.ending) return;
    if (this.current) this.fadeOut(this.current);
    this.current = next ? this.start(next) : null;
  }

  private audioContext(): AudioContext | null {
    if (!this.ctx && typeof AudioContext !== 'undefined') {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * MUSIC_MIX;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private start(track: MusicTrack): Deck {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.loop = track.role === 'menu';
    audio.src = ASSETS + track.file;
    const ctx = this.audioContext();
    let gain: GainNode | null = null;
    if (ctx && this.master) {
      gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_SECONDS);
      ctx.createMediaElementSource(audio).connect(gain).connect(this.master);
    } else audio.volume = this.volume * MUSIC_MIX;
    const deck: Deck = { track, audio, gain, ending: false };
    if (track.role === 'match') {
      // perto do fim, a próxima faixa entra por cima (crossfade)
      audio.addEventListener('timeupdate', () => {
        if (deck.ending || this.current !== deck || !Number.isFinite(audio.duration)) return;
        if (audio.duration - audio.currentTime <= FADE_SECONDS) {
          deck.ending = true;
          this.update();
        }
      });
      audio.addEventListener('ended', () => {
        if (this.current === deck && !deck.ending) {
          deck.ending = true;
          this.update();
        }
      });
    }
    void audio.play().catch(() => undefined);
    return deck;
  }

  private fadeOut(deck: Deck): void {
    deck.ending = true;
    const stop = () => {
      deck.audio.pause();
      deck.audio.removeAttribute('src');
      deck.audio.load();
      deck.gain?.disconnect();
    };
    if (deck.gain && this.ctx) {
      const now = this.ctx.currentTime;
      deck.gain.gain.cancelScheduledValues(now);
      deck.gain.gain.setValueAtTime(deck.gain.gain.value, now);
      deck.gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
      setTimeout(stop, FADE_SECONDS * 1000 + 100);
    } else stop();
  }
}
