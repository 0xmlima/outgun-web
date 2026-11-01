// SPDX-License-Identifier: GPL-2.0-or-later
// Que sample toca em cada evento, como o cliente original (`TM_Sound` em src/clientbase.cpp e
// src/guiclient.cpp:1454-1950, callbacks de física em src/guiclient.cpp:3320-3355) e os sons de sala
// que o servidor manda (`data_sound`). Spec: plan/specs/audio.md.
import type { SessionEvent } from '@outgun/netcode';
import type { AnyMessage } from '@outgun/protocol';
import { SAMPLES, type SampleName } from '@outgun/sim';
import type { FeedFacts } from '../hud/feed.js';

export interface SoundContext {
  readonly me: number;
  /** Sala do próprio jogador (sons "na tela" só da sala atual, `on_screen_exact`). */
  readonly room: { x: number; y: number } | null;
  /** Jogadores que vieram no último frame (`player_on_screen_exact`). */
  readonly onscreen: ReadonlySet<number>;
  /** Tempo do jogo (s), para o intervalo mínimo dos quiques. */
  readonly time: number;
  /**
   * Espectador e replay (OG-535): o jogador está na sala mostrada? Sem isso (na partida), os quiques de
   * todo jogador simulado tocam; com isso, só os da sala que está na tela.
   */
  readonly inView?: (pid: number) => boolean;
}

/** Intervalo mínimo entre sons de quique do mesmo jogador (s). */
const BOUNCE_INTERVAL = 0.2;

export class SoundEvents {
  private readonly wallTime = new Map<number, number>();
  private readonly playerTime = new Map<number, number>();

  constructor(
    /** O tema tem o sample? (sem `colldam`, a colisão usa `hit`). */
    private readonly has: (name: SampleName) => boolean,
    private readonly random: () => number = Math.random,
  ) {}

  private death(): SampleName {
    return this.random() < 0.5 ? 'death1' : 'death2';
  }

  /** Sons de uma mensagem do servidor (antes de a sessão tratá-la). */
  fromMessage(m: AnyMessage, c: SoundContext, facts: FeedFacts): SampleName[] {
    const out: SampleName[] = [];
    switch (m.type) {
      case 'sound': {
        const name = SAMPLES[m.sample];
        if (name) out.push(name);
        break;
      }
      case 'roomSound': {
        // replay e espectador: o som de sala só para quem vê a sala (OG-535)
        const name = SAMPLES[m.sample];
        if (name && c.room && m.roomX === c.room.x && m.roomY === c.room.y) out.push(name);
        break;
      }
      case 'playerJoined':
        if (facts.joined) out.push('entergam');
        break;
      case 'playerLeft':
        out.push('leftgam');
        break;
      case 'teamChange':
        out.push('chanteam');
        break;
      case 'text':
        if (m.kind === 'normal' || m.kind === 'team') out.push('talk');
        break;
      case 'capture':
        out.push('capture');
        break;
      case 'gameOver':
        out.push('gameover');
        break;
      case 'timeEvent':
        if (m.kind === 'fiveMinutesLeft') out.push('5_min');
        else if (m.kind === 'oneMinuteLeft') out.push('1_min');
        break;
      case 'flagReturn':
        out.push('return');
        break;
      case 'flagDrop':
        if (!m.captureDrop) out.push('lost');
        break;
      case 'deathbringer':
        out.push('usedb');
        break;
      case 'powerCollision':
        out.push(this.has('colldam') ? 'colldam' : 'hit');
        break;
      case 'kill':
        if (c.onscreen.has(m.target)) out.push(m.cause === 'deathbringer' ? 'diedb' : this.death());
        if (m.carriedFlag !== 'none') out.push('lost');
        if (facts.spreeStarted !== undefined && facts.spreeStarted === c.me) out.push('spree');
        break;
      case 'suicideEvent':
        if (m.carriedFlag !== 'none') out.push('lost');
        if (c.onscreen.has(m.pid)) out.push(this.death());
        break;
      default:
        break;
    }
    return out;
  }

  /** Sons do que o cliente simula ou extrapola. */
  fromSession(ev: SessionEvent, c: SoundContext): SampleName[] {
    const inRoom = (p: { roomX: number; roomY: number }) => c.room !== null && p.roomX === c.room.x && p.roomY === c.room.y;
    switch (ev.kind) {
      case 'rocketFired':
        return inRoom(ev.pos) ? [ev.power ? 'quadfire' : 'fire'] : [];
      case 'rocketHitPlayer':
        return inRoom(ev.pos) ? ['hit'] : [];
      case 'rocketHitWall':
        return inRoom(ev.pos) ? [ev.power ? 'qwallhit' : 'wallhit'] : [];
      case 'flagCarried':
        return ['got'];
      case 'playerHitWall': {
        if (c.inView && !c.inView(ev.pid)) return [];
        if (c.time <= (this.wallTime.get(ev.pid) ?? -Infinity)) return [];
        this.wallTime.set(ev.pid, c.time + BOUNCE_INTERVAL);
        return ['wabounce'];
      }
      case 'playerHitPlayer': {
        if (c.inView && !c.inView(ev.pid1) && !c.inView(ev.pid2)) return [];
        const t1 = this.playerTime.get(ev.pid1) ?? -Infinity;
        const t2 = this.playerTime.get(ev.pid2) ?? -Infinity;
        if (!(c.time > t1 || c.time > t2)) return [];
        this.playerTime.set(ev.pid1, c.time + BOUNCE_INTERVAL);
        this.playerTime.set(ev.pid2, c.time + BOUNCE_INTERVAL);
        return ['plbounce'];
      }
      default:
        return [];
    }
  }
}
