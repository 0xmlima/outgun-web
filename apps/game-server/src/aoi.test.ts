// SPDX-License-Identifier: GPL-2.0-or-later
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import { presetSettings } from '@outgun/settings';
import { CONTROL, Position, type WorldState } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { buildFrame, minimapPosition, minimapViews, RecipientState, seesRocket } from './aoi.js';
import { loadMaps } from './maps.js';
import { Room, type Connection } from './room.js';

const MAPS = fileURLToPath(new URL('../../../_legacy/maps', import.meta.url));
const [map] = loadMaps(MAPS, ['outgun1']); // 6x6 salas

/** Mundo real: jogadores criados como a sim cria, depois posicionados à mão. */
function scene(specs: { pid: number; room: [number, number]; visibility?: number; dead?: boolean; x?: number }[]) {
  const settings = presetSettings('classic');
  const r = new Room({ id: 't', preset: 'classic', maps: [map!], maxPlayers: 16, seed: 1 });
  const w = r.world;
  for (const s of specs) {
    r.sim.addPlayer(s.pid);
    const pl = w.players[s.pid]!;
    pl.awaitingClientReadies = 0;
    pl.dead = !!s.dead;
    pl.pos = new Position(s.room[0], s.room[1], s.x ?? 200, 150);
    pl.visibility = s.visibility ?? 255;
    pl.startTakeDamageFrame = 0;
  }
  return { w, settings, r };
}

const frameFor = (w: WorldState, settings: ReturnType<typeof presetSettings>, pid: number, rs = new RecipientState()) =>
  buildFrame(w, settings, minimapViews(w, settings), pid, rs, { running: true, lastClientFrame: 0, ping: null }).frame;

describe('jogadores no frame (broadcast_frame)', () => {
  it('só quem está na mesma sala', () => {
    const { w, settings } = scene([
      { pid: 0, room: [0, 0] },
      { pid: 8, room: [1, 0] },
      { pid: 9, room: [0, 0], x: 300 },
    ]);
    expect(frameFor(w, settings, 0).players.map((p) => p.pid)).toEqual([0, 9]);
    expect(frameFor(w, settings, 8).players.map((p) => p.pid)).toEqual([8]);
  });

  it('inimigo com shadow total não vai; com bandeira vai; aliado com shadow sempre vai', () => {
    const { w, settings } = scene([
      { pid: 0, room: [0, 0] },
      { pid: 1, room: [0, 0], visibility: 0, x: 100 },
      { pid: 8, room: [0, 0], visibility: 0, x: 300 },
    ]);
    expect(frameFor(w, settings, 0).players.map((p) => p.pid)).toEqual([0, 1]);
    w.teams[0].flags[0]!.carrier = 8; // inimigo carregando a bandeira vermelha
    expect(frameFor(w, settings, 0).players.map((p) => p.pid)).toEqual([0, 1, 8]);
  });

  it('com shadow e shadow_see_shadow, vê o inimigo com shadow (alfa ≥ 128)', () => {
    const { w, settings } = scene([
      { pid: 0, room: [0, 0], visibility: 50 },
      { pid: 8, room: [0, 0], visibility: 0, x: 300 },
    ]);
    const see = { ...settings, powerups: { ...settings.powerups, shadowSeeShadow: true } };
    const f = frameFor(w, see, 0);
    expect(f.players.find((p) => p.pid === 8)?.visibility).toBe(128);
  });

  it('morto vai sem controles; spawn protegido pisca 128/220', () => {
    const { w, settings } = scene([
      { pid: 0, room: [0, 0] },
      { pid: 8, room: [0, 0], dead: true, x: 300 },
    ]);
    w.players[8]!.controls = CONTROL.up;
    expect(frameFor(w, settings, 0).players.find((p) => p.pid === 8)?.controls).toBe(0);
    w.players[0]!.startTakeDamageFrame = w.frame + 10;
    w.frame = 2;
    expect(frameFor(w, settings, 0).players[0]!.visibility).toBe(128);
    w.frame = 4;
    expect(frameFor(w, settings, 0).players[0]!.visibility).toBe(220);
  });
});

describe('minimapa', () => {
  it('aliados sempre; inimigo só se um aliado vivo está na sala dele', () => {
    const { w, settings } = scene([
      { pid: 0, room: [0, 0] },
      { pid: 1, room: [2, 2] },
      { pid: 8, room: [2, 2], x: 300 },
      { pid: 9, room: [4, 4] },
    ]);
    const v = minimapViews(w, settings);
    expect(v.normal[0].flatMap((s, i) => (s ? [i] : []))).toEqual([0, 1, 8]);
    // o inimigo 9 aparece para o time 0 só com shadow (vê inimigos sem shadow)
    expect(v.shadow[0].flatMap((s, i) => (s ? [i] : []))).toEqual([0, 1, 8, 9]);
  });

  it('quem carrega a bandeira de um time aparece para o outro time; mortos não aparecem', () => {
    const { w, settings } = scene([
      { pid: 0, room: [0, 0] },
      { pid: 1, room: [5, 5] },
      { pid: 8, room: [3, 3] },
      { pid: 9, room: [4, 4], dead: true },
    ]);
    expect(minimapViews(w, settings).normal[1][1]).toBe(false);
    // vermelho carregando a bandeira vermelha (`carry_own_team_flag`): o time azul o vê
    w.teams[0].flags[0]!.carrier = 1;
    expect(minimapViews(w, settings).normal[1][1]).toBe(true);
    expect(minimapViews(w, settings).normal[0][9]).toBe(false);
  });

  it('rodízio: 2 por frame (banda padrão do cliente), sem quem está na sala', () => {
    const { w, settings } = scene([0, 1, 2, 3, 4, 5, 6].map((pid) => ({ pid, room: [pid, 0] as [number, number] })));
    const rs = new RecipientState();
    rs.minimapCatchUp = false;
    const seq = [0, 1, 2].map(() => frameFor(w, settings, 0, rs).minimap.map((m) => m.pid));
    expect(seq).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
    rs.minimapPerFrame = 32;
    expect(frameFor(w, settings, 0, rs).minimap.map((m) => m.pid)).toEqual([1, 2, 3, 4, 5, 6]);
    const limited = { ...settings, server: { ...settings.server, minimapSendLimit: 0 } };
    expect(frameFor(w, limited, 0, rs).minimap).toEqual([]);
  });

  it('primeiro frame do jogo (entrada, troca de mapa) leva todo o minimapa; depois volta o rodízio (OG-346)', () => {
    const { w, settings } = scene([0, 1, 2, 3, 4, 5, 6].map((pid) => ({ pid, room: [pid, 0] as [number, number] })));
    const rs = new RecipientState();
    expect(frameFor(w, settings, 0, rs).minimap.map((m) => m.pid)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(frameFor(w, settings, 0, rs).minimap.map((m) => m.pid)).toEqual([1, 2]);
    buildFrame(w, settings, minimapViews(w, settings), 0, rs, { running: false, lastClientFrame: 0, ping: null }); // pulado
    expect(frameFor(w, settings, 0, rs).minimap).toHaveLength(6);
  });

  it('posição no minimapa (writeMinimapPlayerPosition)', () => {
    const { w } = scene([{ pid: 0, room: [2, 3], x: 236 }]);
    // 6x6 salas: 255/6 = 42 por sala
    expect(minimapPosition(w, w.players[0]!)).toEqual({ x: 2 * 42 + 20, y: 3 * 42 + Math.trunc((42 * (150 - 1e-5)) / 354) });
  });
});

describe('foguetes e power-ups só para quem vê', () => {
  it('see_rockets_distance conta salas com volta no mapa', () => {
    const { w, settings } = scene([{ pid: 0, room: [0, 0] }]);
    const p = w.players[0]!;
    expect(seesRocket(w, settings, p, 0, 0)).toBe(true);
    expect(seesRocket(w, settings, p, 1, 0)).toBe(false);
    const far = { ...settings, world: { ...settings.world, seeRocketsDistance: 2 } };
    expect(seesRocket(w, far, p, 5, 5)).toBe(true); // 1 + 1 dando a volta
    expect(seesRocket(w, far, p, 3, 0)).toBe(false);
  });
});

class Sink implements Connection {
  bytes = 0;
  received: AnyMessage[] = [];
  constructor(private readonly keep: boolean) {}
  send(data: Uint8Array): void {
    this.bytes += data.length;
    if (!this.keep) return;
    const r = decodeFrame(data, 's2c');
    if (r.ok) this.received.push(...r.messages);
  }
  close(): void {}
}

describe('sala com 32 jogadores', () => {
  it('cada um só recebe o que vê; tráfego médio < 10 KB/s por cliente', () => {
    const r = new Room({ id: 'carga', preset: 'classic', maps: [map!], maxPlayers: 32, seed: 3 });
    const sinks: Sink[] = [];
    for (let i = 0; i < 32; i++) {
      const sink = new Sink(i < 2);
      sinks.push(sink);
      const res = r.join(sink, { name: `P${i}`, accountId: null });
      if (!res.ok) throw new Error(res.text);
      r.handle(res.pid, [message('clientReady', {})]);
    }
    // 60 s de jogo com todos andando e atirando ao acaso
    let fired = 0;
    let seed = 1;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let f = 0; f < 600; f++) {
      for (let pid = 0; pid < 32; pid++)
        r.handle(pid, [
          message('input', { clientFrame: f & 255, controls: 1 + Math.floor(rand() * 15), gundir: 0 }),
          message('fire', { on: rand() < 0.5 }),
        ]);
      r.tick();
      // o último frame do jogador 0 só traz jogadores da sala dele (posição de agora)
      const last = sinks[0]!.received.findLast((m) => m.type === 'frame');
      if (last?.type === 'frame' && last.self && !last.skipped)
        for (const p of last.players) {
          const pl = r.world.players[p.pid]!;
          expect([pl.pos.roomX, pl.pos.roomY]).toEqual([last.self.roomX, last.self.roomY]);
        }
      // e todo tiro que ele recebeu saiu da sala dele (see_rockets_distance 0)
      const me = r.world.players[0]!;
      for (const m of sinks[0]!.received)
        if (m.type === 'rocketFire') {
          expect([m.roomX, m.roomY]).toEqual([me.pos.roomX, me.pos.roomY]);
          fired++;
        }
      sinks[0]!.received = [];
    }
    const t = r.traffic();
    console.log(`tráfego por cliente com 32 jogadores: média ${(t.avgBytesPerSecond / 1024).toFixed(2)} KB/s, máximo ${(t.maxBytesPerSecond / 1024).toFixed(2)} KB/s`);
    expect(t.clients).toBe(32);
    expect(t.avgBytesPerSecond).toBeLessThan(10 * 1024);
    const total = r.world.teams[0].shots + r.world.teams[1].shots;
    console.log(`tiros recebidos pelo jogador 0: ${fired} de ${total}`);
    expect(fired).toBeLessThan(total);
  });
});
