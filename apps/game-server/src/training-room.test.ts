// SPDX-License-Identifier: GPL-2.0-or-later
// Sala de treino de ponta a ponta (OG-491, OG-493 a OG-496): bots com papel nos mapas de treino, o que
// cada papel faz e não faz, e as condições de fim de cada modo.
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage, type MessageOf } from '@outgun/protocol';
import { CarriedFlag, Position } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { Room, type Connection } from './room.js';
import { COUNTDOWN_FRAMES, type TrainingConfig, type TrainingModeId } from './training.js';

const MAP_NAMES = ['2 versus 2 (duel)', '3x3 (duel)', 'cebs park', 'pari2', 'the cover 4'];
const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), MAP_NAMES);

class TestConnection implements Connection {
  received: AnyMessage[] = [];
  send(data: Uint8Array): void {
    const r = decodeFrame(data, 's2c');
    if (!r.ok) throw new Error(r.error);
    this.received.push(...r.messages);
  }
  close(): void {}
  training(): MessageOf<'trainingState'>[] {
    return this.received.flatMap((m) => (m.type === 'trainingState' ? [m] : []));
  }
}

function setup(mode: TrainingModeId, map = 0, extra: Partial<TrainingConfig> = {}) {
  const training: TrainingConfig = { mode, bots: 2, allies: 0, level: 3, powerups: false, sameStart: false, ...extra };
  const room = new Room({ id: 't', preset: 'classic', maps: [maps[map]!], mapFiles: [MAP_NAMES[map]!], maxPlayers: 16, seed: 5, training, now: () => 0 });
  const conn = new TestConnection();
  const res = room.join(conn, { name: 'Treino', accountId: null });
  if (!res.ok) throw new Error(res.reason);
  room.handle(res.pid, [message('clientReady', {})]);
  const me = res.pid;
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) room.tick();
  };
  const pl = (pid: number) => room.world.players[pid]!;
  const baseRoom = (team: 0 | 1) => room.world.map.teams[team].flags[0]!.room;
  const bots = () => room.bots().map((pid) => pl(pid));
  const last = () => conn.training().at(-1);
  return { room, conn, me, tick, pl, baseRoom, bots, last };
}

const inRoom = (p: { pos: Position }, r: { x: number; y: number }) => p.pos.roomX === r.x && p.pos.roomY === r.y;

describe('treino: bots só com o papel (OG-491, D-87)', () => {
  it.each(MAP_NAMES.map((n, i) => [n, i] as const))('Ataque em %s: os defensores nunca saem da base nem pegam bandeira', (_n, map) => {
    const t = setup('attack', map, { bots: 3 });
    t.tick(1 + COUNTDOWN_FRAMES);
    expect(t.bots()).toHaveLength(3);
    const base = t.baseRoom(1);
    for (let i = 0; i < 400; i++) {
      t.tick();
      for (const b of t.bots()) {
        if (b.dead) continue;
        expect(inRoom(b, base)).toBe(true);
        expect(b.stats.carriedFlag).toBe(CarriedFlag.None);
      }
    }
  });

  it.each(MAP_NAMES.map((n, i) => [n, i] as const))('Defesa em %s: os aliados ficam na base; os atacantes vão à bandeira', (_n, map) => {
    const t = setup('defense', map, { bots: 3, allies: 2 });
    t.tick(1 + COUNTDOWN_FRAMES);
    const home = t.baseRoom(0);
    let attackersReachedBase = false;
    for (let i = 0; i < 600 && t.last()?.phase !== 'result'; i++) {
      t.tick();
      for (const b of t.bots()) {
        if (b.dead) continue;
        if (b.team === 0) {
          expect(inRoom(b, home)).toBe(true);
          expect(b.stats.carriedFlag).toBe(CarriedFlag.None);
        } else if (inRoom(b, home)) attackersReachedBase = true;
      }
    }
    expect(attackersReachedBase).toBe(true);
  });

  it('Fuga: os perseguidores vêm atrás e não pegam bandeira', () => {
    const t = setup('escape', 3, { bots: 2 });
    t.tick(1 + COUNTDOWN_FRAMES);
    const me = t.pl(t.me);
    expect(me.stats.carriedFlag).toBe(CarriedFlag.Enemy);
    const here = { x: me.pos.roomX, y: me.pos.roomY };
    let reached = false;
    for (let i = 0; i < 200 && !reached && t.last()?.phase === 'playing'; i++) {
      t.tick();
      for (const b of t.bots()) {
        expect(b.stats.carriedFlag).toBe(CarriedFlag.None);
        if (!b.dead && inRoom(b, here)) reached = true;
      }
    }
    expect(reached).toBe(true);
  });

  it('Captura: o portador pega a sua bandeira e vai para a base dele; a escolta não pega bandeira', () => {
    const t = setup('capture', 3, { bots: 3 });
    t.tick(1 + COUNTDOWN_FRAMES);
    const carrier = t.bots().find((b) => b.stats.carriedFlag !== CarriedFlag.None);
    expect(carrier?.team).toBe(1);
    for (const b of t.bots()) if (b !== carrier) expect(b.stats.carriedFlag).toBe(CarriedFlag.None);
    const enemyBase = t.baseRoom(1);
    const dist = () => Math.abs(carrier!.pos.roomX - enemyBase.x) + Math.abs(carrier!.pos.roomY - enemyBase.y);
    const d0 = dist();
    let closest = d0;
    for (let i = 0; i < 150 && t.last()?.phase === 'playing'; i++) {
      t.tick();
      closest = Math.min(closest, dist());
    }
    expect(closest).toBeLessThan(d0);
  });
});

describe('treino: fim da tentativa por modo (OG-493 a OG-496)', () => {
  it('Ataque: sair do quadrado da base com a bandeira é sucesso', () => {
    const t = setup('attack', 2, { bots: 1 });
    t.tick(1 + COUNTDOWN_FRAMES);
    const flag = t.room.world.map.teams[1].flags[0]!;
    const me = t.pl(t.me);
    me.pos = new Position(flag.room.x, flag.room.y, flag.x, flag.y);
    t.tick();
    expect(me.stats.carriedFlag).toBe(CarriedFlag.Enemy);
    me.pos = new Position(flag.room.x === 0 ? 1 : flag.room.x - 1, flag.room.y, 236, 177);
    t.tick();
    expect(t.last()).toMatchObject({ phase: 'result', result: 'success', reason: 'flagOut', mode: 'attack' });
  });

  it('Ataque: derrubar todos os defensores é sucesso; o derrubado não renasce', () => {
    const t = setup('attack', 0, { bots: 2 });
    t.tick(1 + COUNTDOWN_FRAMES);
    for (const pid of t.room.bots()) t.room.sim.killPlayer(pid, false);
    t.room.sim.hooks.kill?.(t.me, t.room.bots()[0]!, 0, CarriedFlag.None, false, false);
    t.tick(2);
    expect(t.last()).toMatchObject({ result: 'success', reason: 'defendersDown' });
  });

  it('Ataque: morrer é falha, e a tentativa recomeça sozinha', () => {
    const t = setup('attack', 1);
    t.tick(1 + COUNTDOWN_FRAMES);
    t.room.handle(t.me, [message('suicide', {})]);
    t.tick(2);
    expect(t.last()).toMatchObject({ result: 'fail', reason: 'died', attempts: 1 });
    t.tick(25);
    expect(t.last()?.phase).toBe('countdown');
    expect(t.pl(t.me).dead).toBe(false);
  });

  it('Defesa: a bandeira saindo do quadrado da base é falha', () => {
    const t = setup('defense', 1, { bots: 1 });
    t.tick(1 + COUNTDOWN_FRAMES);
    const atk = t.bots().find((b) => b.team === 1)!;
    const flag = t.room.world.map.teams[0].flags[0]!;
    atk.pos = new Position(flag.room.x, flag.room.y, flag.x, flag.y);
    t.tick();
    expect(atk.stats.carriedFlag).toBe(CarriedFlag.Enemy);
    atk.pos = new Position(flag.room.x === 0 ? 1 : flag.room.x - 1, flag.room.y, 236, 177);
    t.tick();
    expect(t.last()).toMatchObject({ result: 'fail', reason: 'flagOut' });
  });

  it('Fuga: capturar na sua base é sucesso', () => {
    const t = setup('escape', 4, { bots: 1 });
    t.tick(1 + COUNTDOWN_FRAMES);
    const home = t.room.world.map.teams[0].flags[0]!;
    t.pl(t.me).pos = new Position(home.room.x, home.room.y, home.x, home.y);
    t.tick(2);
    expect(t.last()).toMatchObject({ result: 'success', reason: 'captured' });
  });

  it('Captura: derrubar o portador e tocar na bandeira é sucesso', () => {
    const t = setup('capture', 4, { bots: 0 });
    t.tick(1 + COUNTDOWN_FRAMES);
    const carrier = t.bots()[0]!;
    expect(carrier.stats.carriedFlag).toBe(CarriedFlag.Enemy);
    t.room.sim.killPlayer(carrier.pid, false);
    const flag = t.room.world.teams[0].flags[0]!;
    expect(flag.status).toBe('dropped');
    t.room.settings.world.flagReturnDelay = 0;
    t.pl(t.me).pos = new Position(flag.pos.roomX, flag.pos.roomY, flag.pos.x, flag.pos.y);
    t.tick(2);
    expect(t.last()).toMatchObject({ result: 'success', reason: 'returned' });
  });

  it('Captura: a escolta varia entre as tentativas', () => {
    const t = setup('capture', 3, { bots: 3 });
    const counts = new Set<number>();
    for (let k = 0; k < 8; k++) {
      t.tick(1 + COUNTDOWN_FRAMES);
      counts.add(t.room.bots().length);
      t.room.handle(t.me, [message('suicide', {})]);
      t.tick(25);
    }
    expect(counts.size).toBeGreaterThan(1);
  });
});

describe('bots do treino separados dos do Casual (OG-513)', () => {
  it('só a sala de treino cria bots de treino', () => {
    const t = setup('attack', 0, { bots: 2 });
    t.tick(1 + COUNTDOWN_FRAMES);
    expect(t.room.botClients().map((b) => b.trainingRole)).toEqual(['guard', 'guard']);
    const casual = new Room({ id: 'c', preset: 'classic', maps: [maps[0]!], mapFiles: [MAP_NAMES[0]!], maxPlayers: 16, seed: 5, botTest: true, casualBots: { bots: 4, level: 3 }, now: () => 0 });
    casual.tick();
    expect(casual.botClients()).toHaveLength(4);
    expect(casual.botClients().every((b) => b.trainingRole === null)).toBe(true);
  });
});

describe('treino com convidados (OG-497)', () => {
  function join(room: Room, name: string) {
    const conn = new TestConnection();
    const res = room.join(conn, { name, accountId: null });
    if (!res.ok) throw new Error(res.reason);
    room.handle(res.pid, [message('clientReady', {})]);
    return res.pid;
  }

  it('dois humanos treinando juntos: a falha por morte só quando os dois caem', () => {
    const t = setup('attack', 3, { bots: 2 });
    const friend = join(t.room, 'Amigo');
    t.tick(1);
    t.room.handle(friend, [message('suicide', {})]); // reinício: os dois entram na próxima tentativa
    t.tick(1 + COUNTDOWN_FRAMES);
    const before = t.last()!.attempts;
    t.room.handle(t.me, [message('suicide', {})]);
    t.tick(2);
    expect(t.last()?.phase).toBe('playing');
    t.room.handle(friend, [message('suicide', {})]);
    t.tick(2);
    expect(t.last()).toMatchObject({ result: 'fail', reason: 'died', attempts: before + 1 });
  });

  it.each(['attack', 'defense', 'escape', 'capture'] as const)('%s: humano do lado oposto assume a vaga de um bot', (mode) => {
    const t = setup(mode, 3, { bots: mode === 'capture' ? 0 : 2 });
    const rival = join(t.room, 'Rival');
    t.tick(2);
    const botsBefore = t.room.bots().length;
    t.room.handle(rival, [message('changeTeam', { on: true })]);
    t.tick(1 + COUNTDOWN_FRAMES);
    const rival2 = t.room.world.players.findIndex((p, pid) => p && t.room.playerName(pid) === 'Rival' && t.room.world.teamOf(pid) === 1);
    expect(rival2).toBeGreaterThanOrEqual(0);
    // o lado oposto tem o mesmo tamanho: um bot a menos
    expect(t.room.bots().filter((pid) => t.room.world.teamOf(pid) === 1)).toHaveLength(botsBefore - 1);
    // a morte do humano do lado oposto não encerra a tentativa
    t.room.handle(rival2, [message('suicide', {})]);
    t.tick(2);
    expect(t.last()?.phase).toBe('playing');
  });
});

describe('treino não conta para nada (OG-498)', () => {
  it('nenhum relatório de partida, replay ou evento, por mais tentativas que haja', () => {
    const reports: unknown[] = [];
    const saved: string[] = [];
    const room = new Room({
      id: 't',
      preset: 'classic',
      maps: [maps[0]!],
      mapFiles: [MAP_NAMES[0]!],
      maxPlayers: 16,
      seed: 9,
      training: { mode: 'defense', bots: 3, allies: 1, level: 5, powerups: false, sameStart: false },
      reportMatch: (r) => reports.push(r),
      replays: { save: (key) => (saved.push(key), `x/${key}`) },
      now: () => 0,
    });
    const conn = new TestConnection();
    const res = room.join(conn, { name: 'Treino', accountId: 'conta-1' });
    if (!res.ok) throw new Error(res.reason);
    room.handle(res.pid, [message('clientReady', {})]);
    for (let i = 0; i < 3000; i++) room.tick();
    expect(conn.training().filter((s) => s.phase === 'result').length).toBeGreaterThan(3);
    room.drain();
    expect(room.finished).toBe(true); // sem fim de partida para esperar, fecha já
    expect(reports).toEqual([]);
    expect(saved).toEqual([]);
    expect(room.results).toEqual([]);
  });
});

describe('início variado (OG-500)', () => {
  function starts(sameStart: boolean, mode: TrainingModeId) {
    const t = setup(mode, 3, { bots: 2, sameStart });
    const out: string[] = [];
    for (let k = 0; k < 5; k++) {
      t.tick(3);
      const me = t.pl(t.me);
      const bots = t.bots().map((b) => `${b.pos.roomX},${b.pos.roomY},${Math.round(b.pos.x)},${Math.round(b.pos.y)}`);
      out.push(`${me.pos.roomX},${me.pos.roomY},${Math.round(me.pos.x)},${Math.round(me.pos.y)}|${bots.join('|')}`);
      t.tick(COUNTDOWN_FRAMES);
      t.room.handle(t.me, [message('suicide', {})]);
      t.tick(25);
    }
    return out;
  }

  it.each(['attack', 'defense', 'escape', 'capture'] as const)('%s: tentativas seguidas começam diferente; com "mesmo início", iguais', (mode) => {
    expect(new Set(starts(false, mode)).size).toBeGreaterThan(2);
    expect(new Set(starts(true, mode)).size).toBe(1);
  });
});
