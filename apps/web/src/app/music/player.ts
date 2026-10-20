// SPDX-License-Identifier: GPL-2.0-or-later
// Trilha sonora (OG-221): um tocador só, vivo entre as rotas, separado dos efeitos do jogo. Cada faixa
// toca num `HTMLAudioElement` (streaming: não decodifica minutos de áudio na memória); o Web Audio só
// faz o ganho e o crossfade. Nada é baixado antes do primeiro gesto do jogador (autoplay) nem com a
// trilha desligada (RN-MUS-03, RN-MUS-05). O tocador da tela inicial pausa, pula e silencia a faixa.
import { ASSETS, type MusicTrack } from '../../assets.js';
import { matchTracks, menuTrack, Playlist } from './playlist.js';

/** O que deve tocar: a rotação do menu, a playlist das partidas ou nada (Ranked, replay; D-37). */
export type MusicMode = 'menu' | 'match' | 'off';

/** Duração do crossfade entre faixas e ao entrar/sair da partida. */
export const FADE_SECONDS = 2.5;
/** A música fica abaixo dos efeitos: o volume escolhido é multiplicado por isto. */
export const MUSIC_MIX = 0.6;
/** Na sessão do navegador (aba), o tema já tocou: daqui em diante o menu só rotaciona (RN-MUS-01). */
const THEME_PLAYED_KEY = 'outgun.musicThemePlayed';

type SessionFlags = Pick<Storage, 'getItem' | 'setItem'>;

function sessionFlags(): SessionFlags | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** O que o tocador da tela inicial mostra. */
export interface MusicState {
  /** `locked`: espera o primeiro gesto; `disabled`: trilha desligada nas Opções; `idle`: nada a tocar. */
  readonly status: 'locked' | 'disabled' | 'idle' | 'playing' | 'paused';
  readonly track: MusicTrack | null;
  readonly muted: boolean;
}

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
  private muted = false;
  private paused = false;
  private unlocked = false;
  private themePlayed: boolean;
  private listeners = new Set<() => void>();
  private snapshot: MusicState = { status: 'locked', track: null, muted: false };

  constructor(
    private readonly rng: () => number = Math.random,
    private readonly session: SessionFlags | null = sessionFlags(),
  ) {
    this.playlist = new Playlist([], rng);
    try {
      this.themePlayed = session?.getItem(THEME_PLAYED_KEY) === '1';
    } catch {
      this.themePlayed = false;
    }
  }

  setTracks(tracks: readonly MusicTrack[]): void {
    this.tracks = tracks;
    this.playlist = new Playlist(matchTracks(tracks), this.rng);
    this.update();
  }

  setMode(mode: MusicMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // a pausa é do tocador da tela inicial: a partida casual volta a ter música
    if (mode === 'match' && this.paused) this.resume();
    this.update();
  }

  /** Liga/desliga, volume 0..1 (OG-222) e mudo (tocador da tela inicial: a faixa segue, sem som). */
  configure(enabled: boolean, volume: number, muted = false): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.muted = muted;
    const level = this.muted ? 0 : this.volume * MUSIC_MIX;
    if (this.master) this.master.gain.value = level;
    if (this.current && !this.current.gain) this.current.audio.volume = level;
    if (enabled !== this.enabled) {
      this.enabled = enabled;
      if (!enabled) this.paused = false;
      this.update();
    } else this.emit();
  }

  pause(): void {
    if (!this.current || this.paused) return;
    this.paused = true;
    this.current.audio.pause();
    this.emit();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.current) void this.current.audio.play().catch(() => undefined);
    this.emit();
  }

  /** Próxima faixa da rotação, com crossfade. */
  skip(): void {
    if (!this.current) return;
    this.paused = false;
    this.current.ending = true;
    this.update();
  }

  /** Posição da faixa atual, em segundos (barra de progresso do tocador). */
  position(): { time: number; duration: number } | null {
    const audio = this.current?.audio;
    if (!audio) return null;
    return { time: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : this.current!.track.duration };
  }

  /** Para `useSyncExternalStore`. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): MusicState => this.snapshot;

  private emit(): void {
    const status: MusicState['status'] = !this.enabled ? 'disabled' : !this.unlocked ? 'locked' : !this.current ? 'idle' : this.paused ? 'paused' : 'playing';
    const track = this.current?.track ?? null;
    const prev = this.snapshot;
    if (prev.status === status && prev.track === track && prev.muted === this.muted) return;
    this.snapshot = { status, track, muted: this.muted };
    for (const listener of this.listeners) listener();
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
    if (!this.enabled || !this.unlocked || this.mode === 'off') return undefined;
    // a faixa em andamento continua nas trocas de tela e de mapa e entre o menu e a partida; só o tema
    // do menu não entra na partida (RN-MUS-02)
    if (this.current && !this.current.ending && (this.mode === 'menu' || this.current.track.role === 'match')) return this.current.track;
    const theme = menuTrack(this.tracks);
    // o menu abre com o tema na primeira vez da sessão; depois rotaciona as outras faixas (RN-MUS-01)
    if (this.mode === 'menu' && theme && !this.themePlayed) {
      this.themePlayed = true;
      try {
        this.session?.setItem(THEME_PLAYED_KEY, '1');
      } catch {
        // sem sessionStorage, o tema volta a abrir a cada página
      }
      return theme;
    }
    return this.playlist.next() ?? (this.mode === 'menu' ? theme : undefined);
  }

  private update(): void {
    const next = this.wanted();
    if (!(next && next.id === this.current?.track.id && !this.current.ending)) {
      if (this.current) this.fadeOut(this.current);
      this.current = next ? this.start(next) : null;
      if (!this.current) this.paused = false;
    }
    this.emit();
  }

  private audioContext(): AudioContext | null {
    if (!this.ctx && typeof AudioContext !== 'undefined') {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume * MUSIC_MIX;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private start(track: MusicTrack): Deck {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = ASSETS + track.file;
    const ctx = this.audioContext();
    let gain: GainNode | null = null;
    if (ctx && this.master) {
      gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_SECONDS);
      ctx.createMediaElementSource(audio).connect(gain).connect(this.master);
    } else audio.volume = this.muted ? 0 : this.volume * MUSIC_MIX;
    const deck: Deck = { track, audio, gain, ending: false };
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
