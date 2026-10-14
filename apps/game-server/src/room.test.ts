// SPDX-License-Identifier: GPL-2.0-or-later
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import { Position, SAMPLES } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { Room, type Connection } from './room.js';
import { RoomManager } from './rooms.js';

const MAPS = fileURLToPath(new URL('../../../maps', import.meta.url));
const maps = loadMaps(MAPS, ['outgun1']);

class TestConnection implements Connection {
  received: AnyMessage[] = [];
  closed: [number, string] | null = null;
  send(data: Uint8Array): void {
    const r = decodeFrame(data, 's2c');
    if (!r.ok) throw new Error(r.error);
    this.received.push(...r.messages);
  }
  close(code: number, reason: string): void {
    this.closed = [code, reason];
  }
  of<T extends AnyMessage['type']>(type: T): Extract<AnyMessage, { type: T }>[] {
    return this.received.filter((m): m is Extract<AnyMessage, { type: T }> => m.type === type);
  }
  lastFrame() {
    return this.of('frame').at(-1);
  }
}

function room(preset = 'classic') {
  return new Room({ id: 'r', preset, maps, maxPlayers: 16, seed: 7 });
}

function join(r: Room, name: string) {
  const conn = new TestConnection();
  const result = r.join(conn, { name, accountId: null });
  if (!result.ok) throw new Error(result.text);
  r.handle(result.pid, [message('clientReady', {})]);
  return { conn, pid: result.pid };
}

describe('Room', () => {
  it('entrada: times alternados, boas-vindas com configuração, mapa e bandeiras', () => {
    const r = room();
    const a = join(r, 'Ana');
    const b = join(r, 'Bia');
    expect([a.pid, b.pid]).toEqual([0, 8]);
    const types = a.conn.received.map((m) => m.type);
    expect(types.slice(0, 4)).toEqual(['welcome', 'serverSettings', 'mapChange', 'playersPresent']);
    expect(a.conn.of('flagUpdate')).toHaveLength(3);
    expect(b.conn.of('playerJoined').map((m) => m.name)).toContain('Ana');
  });

  it('nasce na base depois do clientReady e recebe frames com o próprio estado', () => {
    const r = room();
    const a = join(r, 'Ana');
    for (let i = 0; i < 3; i++) r.tick();
    const f = a.conn.lastFrame();
    expect(f?.skipped).toBe(false);
    expect(f?.self).not.toBeNull();
    expect(a.conn.of('spawn').map((m) => m.pid)).toContain(0);
    const red = maps[0]!.teams[0].spawn.map((s) => `${s.room.x},${s.room.y}`);
    expect(red).toContain(`${f?.self?.roomX},${f?.self?.roomY}`);
  });

  it('duas conexões veem o mesmo estado da sala', () => {
    const r = room();
    const a = join(r, 'Ana');
    const b = join(r, 'Bia');
    for (let i = 0; i < 3; i++) r.tick();
    // coloca os dois na mesma sala
    r.world.players[8]!.pos = new Position(2, 2, 300, 100);
    r.world.players[0]!.pos = new Position(2, 2, 100, 100);
    r.handle(0, [message('input', { clientFrame: 1, controls: 8, gundir: 0 })]);
    for (let i = 0; i < 5; i++) r.tick();
    const fa = a.conn.lastFrame()!;
    const fb = b.conn.lastFrame()!;
    expect(fa.frame).toBe(fb.frame);
    expect(fa.players).toEqual(fb.players);
    expect(fa.players.map((p) => p.pid)).toEqual([0, 8]);
    expect(fa.players[0]!.x).toBeGreaterThan(100); // andou para a direita
    expect(fa.lastClientFrame).toBe(1);
  });

  it('tiro e morte viram eventos; frags são enviados quando mudam', () => {
    const r = room();
    const a = join(r, 'Ana');
    join(r, 'Bia');
    for (let i = 0; i < 3; i++) r.tick();
    r.world.players[0]!.pos = new Position(2, 2, 100, 177);
    r.world.players[8]!.pos = new Position(2, 2, 200, 177);
    r.world.players[8]!.health = 1;
    r.world.players[0]!.gundir = 0;
    r.handle(0, [message('fire', { on: true })]);
    for (let i = 0; i < 10; i++) r.tick();
    expect(a.conn.of('kill')).toEqual([expect.objectContaining({ attacker: 0, target: 8, cause: 'rocket' })]);
    expect(a.conn.of('frags').at(-1)).toEqual({ type: 'frags', pid: 0, frags: 1 });
  });

  it('saída larga a bandeira e avisa os outros; Ranked recusa convidado', () => {
    const r = room();
    const a = join(r, 'Ana');
    const b = join(r, 'Bia');
    r.tick();
    r.leave(b.pid);
    r.tick();
    expect(a.conn.of('playerLeft')).toEqual([{ type: 'playerLeft', pid: 8 }]);
    expect(r.world.players[8]).toBeUndefined();
    expect(room('ranked').join(new TestConnection(), { name: 'x', accountId: null })).toMatchObject({ ok: false, reason: 'rankedNeedsAccount' });
  });

  it('sala cheia recusa', () => {
    const r = new Room({ id: 'r', preset: 'classic', maps, maxPlayers: 2, seed: 1 });
    join(r, 'a');
    join(r, 'b');
    expect(r.join(new TestConnection(), { name: 'c', accountId: null })).toMatchObject({ ok: false, reason: 'serverFull' });
  });

  it('fim de partida: placar, troca de mapa, sem simulação durante o placar e recomeço', () => {
    const r = room();
    const a = join(r, 'Ana');
    join(r, 'Bia');
    r.tick();
    // captura com limite 1
    (r.settings.world as { captureLimit: number }).captureLimit = 1;
    const blue = r.world.teams[1].flags[0]!;
    const home = r.world.teams[0].flags[0]!.home;
    r.world.players[0]!.pos = new Position(home.roomX, home.roomY, home.x + 5, home.y);
    blue.take(0, 0);
    r.world.players[0]!.stats.carriedFlag = 2;
    r.tick();
    expect(a.conn.of('gameOver')).toHaveLength(1);
    expect(r.results).toHaveLength(1);
    expect(r.results[0]!.winner).toBe(0);
    const frameAtEnd = r.frame;
    for (let i = 0; i < 49; i++) r.tick();
    expect(a.conn.lastFrame()?.skipped).toBe(true);
    expect(a.conn.of('startGame')).toHaveLength(1); // só o do segundo jogador
    r.tick();
    expect(a.conn.of('startGame')).toHaveLength(2);
    // 50 frames de placar depois do frame do fim (como match-sudden-death no original)
    expect(r.world.mapStartFrame).toBe(frameAtEnd - 1 + 50);
    // precisa confirmar o mapa novo antes de nascer
    r.handle(a.pid, [message('clientReady', {})]);
    for (let i = 0; i < 2; i++) r.tick();
    expect(a.conn.lastFrame()?.skipped).toBe(false);
  });
});

describe('Room: dados do HUD (OG-065)', () => {
  it('chat: todos recebem "Nome: texto"; com ponto, só o time; comando é ignorado', () => {
    const r = room();
    const a = join(r, 'Ana');
    const b = join(r, 'Bia'); // outro time
    const c = join(r, 'Cid'); // time da Ana
    r.handle(a.pid, [message('chat', { text: 'oi', teamOnly: false })]);
    r.handle(a.pid, [message('chat', { text: '.vem', teamOnly: false })]);
    r.handle(a.pid, [message('chat', { text: '/help', teamOnly: false })]);
    r.tick();
    expect(b.conn.of('text').map((m) => m.text)).toEqual(['Ana: oi']);
    expect(c.conn.of('text').map((m) => [m.kind, m.text])).toEqual([
      ['normal', 'Ana: oi'],
      ['team', 'Ana: vem'],
    ]);
  });

  it('chat mostra a clan tag como "(TAG) nome" (RN-NOM-03)', () => {
    const r = room();
    const conn = new TestConnection();
    const joined = r.join(conn, { name: 'Ana', accountId: 'u-1', clanTag: 'XYZ' });
    if (!joined.ok) throw new Error(joined.text);
    r.handle(joined.pid, [message('clientReady', {}), message('chat', { text: 'oi', teamOnly: false })]);
    r.tick();
    expect(conn.of('text').map((m) => m.text)).toEqual(['(XYZ) Ana: oi']);
  });

  it('chat com caractere de controle é mensagem inválida', () => {
    const r = room();
    const a = join(r, 'Ana');
    r.handle(a.pid, [message('chat', { text: 'a\u0007', teamOnly: false })]);
    expect(a.conn.closed?.[1]).toBe('client_misbehavior');
  });

  it('tempo de mapa na entrada, arma do jogador e placar quando muda', () => {
    const r = new Room({ id: 'r', preset: 'classic', maps, maxPlayers: 16, seed: 7 });
    const a = join(r, 'Ana');
    expect(a.conn.of('mapTime')).toEqual([{ type: 'mapTime', elapsed: 0, left: 0 }]); // clássico: sem limite
    r.tick();
    r.tick();
    expect(a.conn.of('weaponChange').map((m) => m.level)).toEqual([1]);
    r.world.teams[1].score = 2;
    r.tick();
    expect(a.conn.of('scoreUpdate')).toEqual([{ type: 'scoreUpdate', team: 'blue', score: 2 }]);
  });
});

describe('Room: sons da sala (OG-067)', () => {
  it('escudo atingido: som para quem está na sala do jogador', () => {
    const r = room();
    const a = join(r, 'Ana');
    const b = join(r, 'Bia');
    r.tick();
    r.tick();
    const ana = r.world.players[a.pid]!;
    const bia = r.world.players[b.pid]!;
    bia.pos = ana.pos.clone(); // mesma sala
    ana.shield = 1;
    ana.energy = 150;
    r.world.frame = Math.max(r.world.frame, ana.startTakeDamageFrame);
    r.sim.damagePlayer(a.pid, b.pid, 70, 0);
    r.tick();
    const code = (conn: TestConnection) => conn.of('sound').map((m) => m.sample);
    expect(code(a.conn)).toEqual([SAMPLES.indexOf('shieldd')]);
    expect(code(b.conn)).toEqual([SAMPLES.indexOf('shieldd')]);
  });
});

describe('Room: times (OG-044)', () => {
  const small = () => new Room({ id: 'r', preset: 'classic', maps, maxPlayers: 4, seed: 7 });

  it('sala cheia de bots: quem entra toma o lugar de um bot', () => {
    const r = small();
    for (let i = 0; i < 4; i++) expect(r.addBot(`bot${i}`).ok).toBe(true);
    expect(r.bots()).toHaveLength(4);
    const a = join(r, 'Ana');
    expect(r.bots()).toHaveLength(3);
    expect(r.world.players[a.pid]).toBeDefined();
    expect(a.conn.of('welcome')[0]?.pid).toBe(a.pid);
    const left = a.conn.of('playerLeft');
    expect(left).toHaveLength(0); // saiu antes de ela entrar
    // sala cheia só de humanos: recusa
    const r2 = small();
    for (const n of ['a', 'b', 'c', 'd']) join(r2, n);
    expect(r2.join(new TestConnection(), { name: 'e', accountId: null }).ok).toBe(false);
  });

  it('Ctrl+End com times iguais: troca com um bot do outro time e avisa todos', () => {
    const r = small();
    const a = join(r, 'Ana'); // pid 0 ou 2
    const bot = r.addBot('Robô');
    expect(bot.ok && r.world.teamOf(bot.ok ? bot.pid : 0) !== r.world.teamOf(a.pid)).toBe(true);
    r.handle(a.pid, [message('changeTeam', { on: true })]);
    r.tick();
    const change = a.conn.of('teamChange')[0];
    expect(change).toMatchObject({ from: a.pid, to: bot.ok ? bot.pid : -1 });
    expect(change?.swappedColor).not.toBe(255);
    expect(r.bots()).toEqual([a.pid]); // o bot ficou com a vaga antiga dela
  });

  it('time com 1 a mais: muda sozinho; depois espera 10 s para trocar de novo', () => {
    const r = small();
    const a = join(r, 'Ana');
    const conn = a.conn;
    let pid = a.pid;
    r.handle(pid, [message('changeTeam', { on: true })]);
    r.tick();
    const moved = conn.of('teamChange')[0];
    expect(moved).toMatchObject({ from: pid, swappedColor: 255 });
    pid = moved!.to;
    expect(r.world.teamOf(pid)).not.toBe(r.world.teamOf(a.pid));
    r.handle(pid, [message('changeTeam', { on: true })]);
    for (let i = 0; i < 50; i++) r.tick();
    expect(conn.of('teamChange')).toHaveLength(1);
    for (let i = 0; i < 60; i++) r.tick();
    expect(conn.of('teamChange')).toHaveLength(2);
  });

  it('bots equilibram os times sozinhos quando a diferença chega a 2', () => {
    const r = small();
    const ana = join(r, 'Ana').pid;
    for (const name of ['b1', 'b2', 'b3']) r.addBot(name);
    // tira os dois bots do outro time: fica 2 × 0
    for (const b of r.bots().filter((b) => r.world.teamOf(b) !== r.world.teamOf(ana))) r.removeBot(b);
    expect(r.bots()).toHaveLength(1);
    r.tick();
    expect(r.world.teamOf(r.bots()[0] as number)).not.toBe(r.world.teamOf(ana));
  });

  it('cores favoritas: a primeira livre do time', () => {
    const r = room();
    const a = join(r, 'Ana');
    r.handle(a.pid, [message('favoriteColors', { colors: [5, 6] })]);
    r.tick();
    expect(a.conn.of('playerInfo').at(-1)).toMatchObject({ pid: a.pid, color: 5 });
  });
});

describe('Room: rotação e votação de mapas (OG-045)', () => {
  const rot = loadMaps(MAPS, ['outgun1', 'coliseu', 'sisso']);
  const make = () => new Room({ id: 'r', preset: 'classic', maps: rot, mapFiles: ['outgun1', 'coliseu', 'sisso'], maxPlayers: 8, seed: 7 });

  it('lista de mapas e mapa atual na entrada', () => {
    const a = join(make(), 'Ana');
    expect(a.conn.of('mapList')[0]?.maps.map((m) => m.file)).toEqual(['outgun1', 'coliseu', 'sisso']);
    expect(a.conn.of('currentMap')[0]?.mapIndex).toBe(0);
  });

  it('maioria quer sair e votou num mapa: troca para ele; bots não contam', () => {
    const r = make();
    const a = join(r, 'Ana');
    const b = join(r, 'Bia');
    r.addBot('robô');
    r.handle(a.pid, [message('mapVote', { map: 2 }), message('mapExit', { on: true })]);
    r.tick();
    expect(a.conn.of('mapChange').filter((m) => m.reason === 'vote')).toHaveLength(0); // 1 a 1
    r.handle(b.pid, [message('mapExit', { on: true })]);
    r.tick();
    const change = a.conn.of('mapChange').find((m) => m.reason === 'vote');
    expect(change?.file).toBe('sisso');
    expect(a.conn.of('mapVotes').at(-1)?.votes).toEqual([0, 0, 0]); // voto no mapa escolhido some
  });

  it('anúncio dos votos e votos negativos pulando mapas', () => {
    const r = make();
    const a = join(r, 'Ana');
    const b = join(r, 'Bia');
    r.handle(a.pid, [message('negativeMapVotes', { maps: [1] })]);
    r.handle(a.pid, [message('mapExit', { on: true })]);
    r.tick();
    expect(a.conn.of('mapChangeInfo').at(-1)).toMatchObject({ votes: 1, needed: 2 });
    r.handle(b.pid, [message('mapExit', { on: true })]);
    r.tick();
    expect(a.conn.of('mapChange').find((m) => m.reason === 'vote')?.file).toBe('sisso'); // coliseu tinha voto negativo
  });
});

describe('RoomManager', () => {
  it('encerra sala vazia depois do tempo configurado; salas fixas ficam', () => {
    let t = 0;
    const clock = { now: () => t, setTimeout: () => 0, clearTimeout: () => {} };
    const m = new RoomManager({ emptyTimeoutMs: 1000, clock, seed: () => 1 });
    m.create({ id: 'temp', preset: 'classic', maps, maxPlayers: 16 });
    m.create({ id: 'fixa', preset: 'classic', maps, maxPlayers: 16, persistent: true });
    const conn = new TestConnection();
    m.get('temp')!.join(conn, { name: 'a', accountId: null });
    m.tickAll();
    m.get('temp')!.leave(0);
    for (; t < 1000; t += 100) m.tickAll();
    expect(m.get('temp')).toBeDefined();
    m.tickAll();
    expect(m.get('temp')).toBeUndefined();
    expect(m.get('fixa')).toBeDefined();
    expect(m.metrics().rooms).toBe(1);
  });

  it('encerrar a sala avisa e fecha as conexões', () => {
    const m = new RoomManager({ emptyTimeoutMs: 1000, seed: () => 1 });
    const r = m.create({ id: 'x', preset: 'classic', maps, maxPlayers: 16 });
    const conn = new TestConnection();
    r.join(conn, { name: 'a', accountId: null });
    m.close('x');
    expect(conn.of('disconnecting')).toEqual([{ type: 'disconnecting', reason: 'shutdown', seconds: 0 }]);
    expect(conn.closed?.[0]).toBe(1001);
  });
});

