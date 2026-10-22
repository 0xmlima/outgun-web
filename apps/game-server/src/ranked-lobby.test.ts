// SPDX-License-Identifier: GPL-2.0-or-later
// Lobby Ranked (OG-252/254): fases, entrada/saída, voto, "Pronto" e contagem; e a sala: com 5 de 6
// num 3x3 ninguém entra no mapa.
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import type { PlayerState } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { COUNTDOWN_FRAMES, RankedLobby, READY_FRAMES, tallyVotes, VOTE_FRAMES } from './ranked-lobby.js';
import { RANKED_RECONNECT_FRAMES } from './pause.js';
import { Room, type Connection } from './room.js';

const first = () => 0;

/** Lobby 3x3 com 6 membros (pids 0..5) e 3 mapas. */
function full(rand: (n: number) => number = first) {
  const l = new RankedLobby(6, 3, rand);
  for (let pid = 0; pid < 6; pid++) l.join(pid, 0);
  return l;
}

const allReady = (l: RankedLobby, frame: number) => {
  for (const pid of l.members.keys()) l.setReady(pid, true, frame);
};

describe('fases do lobby Ranked (OG-252)', () => {
  it('só sai do lobby com a sala completa; quem sai no voto volta todos ao lobby', () => {
    const l = new RankedLobby(6, 3, first);
    for (let pid = 0; pid < 5; pid++) l.join(pid, 0);
    expect(l.phase).toBe('lobby');
    l.join(5, 1);
    expect(l.phase).toBe('vote');
    l.vote(0, 2, 2);
    l.leave(3, 3);
    expect([l.phase, l.members.get(0)?.vote, l.acceptsJoins]).toEqual(['lobby', -1, true]);
    l.join(3, 4);
    expect(l.phase).toBe('vote');
  });

  it('jogo: não aceita entradas; fim de jogo da série volta ao voto, fim da série fecha', () => {
    const l = full();
    for (let pid = 0; pid < 6; pid++) l.vote(pid, 1, 1);
    allReady(l, 2);
    l.tick(2 + COUNTDOWN_FRAMES);
    expect([l.phase, l.acceptsJoins, l.playing]).toEqual(['game', false, true]);
    l.leave(4, 100); // saiu no meio do jogo: a vaga reabre só entre jogos (D-43)
    expect(l.acceptsJoins).toBe(false);
    l.gameEnded(false, 200);
    expect([l.phase, l.acceptsJoins]).toEqual(['lobby', true]);
    l.join(4, 201);
    expect(l.phase).toBe('vote');
    l.tick(201 + VOTE_FRAMES);
    allReady(l, 600);
    l.tick(600 + COUNTDOWN_FRAMES);
    l.gameEnded(true, 900);
    expect([l.phase, l.acceptsJoins]).toEqual(['finished', false]);
  });
});

describe('voto, "Pronto" e contagem (OG-254)', () => {
  it('voto termina quando todos votam ou no tempo; empate sorteia entre os empatados; sem votos sorteia na rotação', () => {
    expect(tallyVotes([1, 1, 2, -1], 3, first)).toBe(1);
    expect(tallyVotes([2, 0, 2, 0], 3, (n) => n - 1)).toBe(2);
    expect(tallyVotes([2, 0, 2, 0], 3, first)).toBe(0);
    expect(tallyVotes([-1, -1], 5, (n) => n - 1)).toBe(4);
    const l = full();
    for (let pid = 0; pid < 6; pid++) l.vote(pid, 2, 10);
    expect([l.phase, l.chosenMap]).toEqual(['ready', 2]);
    const t = full((n) => n - 1);
    t.vote(0, 0, 1);
    t.tick(VOTE_FRAMES - 1);
    expect(t.phase).toBe('vote');
    t.tick(VOTE_FRAMES);
    expect([t.phase, t.chosenMap]).toEqual(['ready', 0]);
  });

  it('contagem de 5 s com todos prontos; desmarcar, trocar de lado ou sair cancela e recomeça do zero', () => {
    const l = full();
    l.tick(VOTE_FRAMES);
    allReady(l, 400);
    expect(l.phase).toBe('countdown');
    l.setReady(2, false, 420);
    expect(l.phase).toBe('ready');
    l.setReady(2, true, 430);
    expect([l.phase, l.phaseStart]).toEqual(['countdown', 430]);
    l.tick(430 + COUNTDOWN_FRAMES - 1);
    expect(l.phase).toBe('countdown');
    l.moved([[0, 3], [3, 0]], 470);
    expect(l.phase).toBe('ready');
    expect(l.members.get(3)?.ready).toBe(true);
    l.setReady(0, false, 471);
    l.setReady(0, true, 472);
    expect(l.tick(472 + COUNTDOWN_FRAMES)).toContainEqual({ type: 'start', map: 0 });
    expect(l.phase).toBe('game');
    const s = full();
    s.tick(VOTE_FRAMES);
    allReady(s, 400);
    s.leave(5, 410);
    expect(s.phase).toBe('lobby');
  });

  it('quem não marca "Pronto" em 60 s depois do voto sai (contagens canceladas não renovam o prazo)', () => {
    const l = full();
    l.tick(VOTE_FRAMES);
    for (let pid = 0; pid < 5; pid++) l.setReady(pid, true, 310);
    expect(l.tick(VOTE_FRAMES + READY_FRAMES - 1)).toEqual([]);
    expect(l.tick(VOTE_FRAMES + READY_FRAMES)).toContainEqual({ type: 'kick', pids: [5] });
  });
});

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
  last<T extends AnyMessage['type']>(type: T): Extract<AnyMessage, { type: T }> | undefined {
    return this.received.filter((m): m is Extract<AnyMessage, { type: T }> => m.type === type).at(-1);
  }
}

describe('sala Ranked 3x3 com lobby (OG-252)', () => {
  const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), ['outgun1', '2 versus 2 (duel)']);
  const room = () => new Room({ id: 'r-1', preset: 'ranked', maps, mapFiles: ['outgun1', '2 versus 2 (duel)'], maxPlayers: 6, seed: 3, ranked: { format: '3x3', bestOf: 3 } });
  const join = (r: Room, n: number) => {
    const conn = new TestConnection();
    const res = r.join(conn, { name: `J${n}`, accountId: `00000000-0000-4000-8000-00000000000${n}` });
    if (!res.ok) throw new Error(res.text);
    r.handle(res.pid, [message('clientReady', {})]);
    return { conn, pid: res.pid };
  };
  const alive = (r: Room) => r.world.players.filter((p): p is PlayerState => p !== null && p !== undefined && !p.dead).length;
  const run = (r: Room, frames: number) => {
    for (let i = 0; i < frames; i++) r.tick();
  };

  it('com 5 de 6 ninguém entra no mapa; com 6, voto → prontos → contagem → jogo', () => {
    const r = room();
    expect(() => new Room({ id: 'x', preset: 'ranked', maps, maxPlayers: 8, seed: 1, ranked: { format: '3x3', bestOf: 1 } })).toThrow();
    const players = [1, 2, 3, 4, 5].map((n) => join(r, n));
    run(r, 100);
    expect([r.lobby?.phase, alive(r)]).toEqual(['lobby', 0]);
    expect(players[0]!.conn.last('lobbyState')).toMatchObject({ phase: 'lobby', teamSize: 3, bestOf: 3, gameNo: 1, members: expect.any(Array) });
    expect(r.join(new TestConnection(), { name: 'Convidado', accountId: null })).toMatchObject({ ok: false, reason: 'rankedNeedsAccount' });
    players.push(join(r, 6));
    run(r, 1);
    expect(players[5]!.conn.last('lobbyState')).toMatchObject({ phase: 'vote', seconds: 30 });
    expect(r.join(new TestConnection(), { name: 'J7', accountId: '00000000-0000-4000-8000-000000000007' })).toMatchObject({ ok: false, reason: 'serverFull' });
    for (const p of players) r.handle(p.pid, [message('lobbyVote', { map: 1 })]);
    run(r, 1);
    expect(r.lobby?.phase).toBe('ready');
    for (const p of players) r.handle(p.pid, [message('lobbyReady', { ready: true })]);
    run(r, 1);
    expect(r.lobby?.phase).toBe('countdown');
    expect(alive(r)).toBe(0);
    run(r, COUNTDOWN_FRAMES + 2);
    expect(r.lobby?.phase).toBe('game');
    expect(r.world.map.title).toBe(maps[1]!.title);
    expect(r.world.mapTime()).toBeLessThan(5); // o tempo do mapa começa com o jogo
    for (const p of players) r.handle(p.pid, [message('clientReady', {})]);
    run(r, 30);
    expect(alive(r)).toBe(6);
  });

  it('quem sai no lobby libera a vaga; quem cai fora do jogo também', () => {
    const r = room();
    const a = join(r, 1);
    join(r, 2);
    r.leave(a.pid);
    run(r, 1);
    expect(r.lobby?.members.size).toBe(1);
    const c = join(r, 3);
    r.disconnect(c.pid, c.conn);
    expect(r.playerCount).toBe(1);
  });

  const joinClan = (r: Room, n: number, clanId: string | null) => {
    const conn = new TestConnection();
    const res = r.join(conn, { name: `J${n}`, accountId: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, clanId });
    if (!res.ok) throw new Error(res.text);
    return { conn, pid: res.pid };
  };
  const team = (r: Room, pid: number) => r.world.teamOf(pid);

  it('clã "nn" entrando intercalado com outros termina do mesmo lado (OG-253)', () => {
    const r = room();
    const nn = [joinClan(r, 1, 'nn'), joinClan(r, 2, null), joinClan(r, 3, 'nn'), joinClan(r, 4, 'bc'), joinClan(r, 5, 'nn'), joinClan(r, 6, null)];
    const nnTeams = [nn[0]!, nn[2]!, nn[4]!].map((p) => team(r, p.pid));
    expect(new Set(nnTeams).size).toBe(1);
    expect([nn[1]!, nn[3]!, nn[5]!].every((p) => team(r, p.pid) !== nnTeams[0])).toBe(true);
  });

  it('troca de lado: vaga livre move; lado cheio só troca com o aceite do outro (OG-253)', () => {
    const r = room();
    const a = joinClan(r, 1, null);
    const b = joinClan(r, 2, null);
    expect(team(r, a.pid)).not.toBe(team(r, b.pid));
    r.handle(a.pid, [message('lobbySide', { target: 255 })]);
    const movedA = [...r.lobby!.members.keys()].find((pid) => pid !== b.pid)!;
    expect(team(r, movedA)).toBe(team(r, b.pid));
    // enche a sala: 3 x 3
    const rest = [3, 4, 5, 6].map((n) => joinClan(r, n, null));
    run(r, 1);
    const red = [...r.lobby!.members.keys()].filter((pid) => team(r, pid) === 0);
    const blue = [...r.lobby!.members.keys()].filter((pid) => team(r, pid) === 1);
    expect([red.length, blue.length]).toEqual([3, 3]);
    r.handle(red[0]!, [message('lobbySide', { target: 255 })]); // lado cheio: nada
    expect(team(r, red[0]!)).toBe(0);
    r.handle(red[0]!, [message('lobbySide', { target: blue[0]! })]);
    run(r, 1);
    const conn = [a, b, ...rest].find((p) => p.conn.received.length > 0)!.conn;
    expect(conn.last('lobbyState')?.swaps).toEqual([{ from: red[0], to: blue[0] }]);
    expect(team(r, red[0]!)).toBe(0); // sem aceite, nada muda
    r.handle(blue[1]!, [message('lobbySwapAnswer', { from: red[0]!, accept: true })]); // não era com ele
    expect(team(r, red[0]!)).toBe(0);
    r.handle(blue[0]!, [message('lobbySwapAnswer', { from: red[0]!, accept: true })]);
    expect(r.lobby!.members.size).toBe(6);
    run(r, 1);
    expect(conn.last('lobbyState')?.swaps).toEqual([]);
    expect(conn.received.some((m) => m.type === 'teamChange' && m.from === red[0] && m.to === blue[0])).toBe(true);
  });

  /** Sala completa (6 contas) já no voto. */
  const fullRoom = () => {
    const r = room();
    const players = [1, 2, 3, 4, 5, 6].map((n) => join(r, n));
    run(r, 1);
    return { r, players };
  };
  const play = (r: Room, players: { pid: number }[]) => {
    for (const p of players) r.handle(p.pid, [message('lobbyVote', { map: 0 })]);
    for (const p of players) r.handle(p.pid, [message('lobbyReady', { ready: true })]);
    run(r, COUNTDOWN_FRAMES + 2);
    expect(r.lobby?.phase).toBe('game');
  };
  const endGame = (r: Room, winner: 0 | 1) => (r as unknown as { onGameOver(reason: string, result: object): void }).onGameOver('captureLimit', { reason: 'captureLimit', winner, players: [], teams: [] });

  it('quem não marca "Pronto" em 60 s depois do voto sai e a vaga reabre (OG-254)', () => {
    const { r, players } = fullRoom();
    run(r, VOTE_FRAMES + 1);
    expect(r.lobby?.phase).toBe('ready');
    for (const p of players.slice(0, 5)) r.handle(p.pid, [message('lobbyReady', { ready: true })]);
    run(r, READY_FRAMES);
    expect(players[5]!.conn.closed).toEqual([4000, 'notReady']);
    expect([r.playerCount, r.lobby?.phase, r.lobby?.acceptsJoins]).toEqual([5, 'lobby', true]);
  });

  it('série md3: fim de jogo volta todos ao voto com o placar da série; 2-0 encerra e a sala fecha (D-41)', () => {
    const { r, players } = fullRoom();
    play(r, players);
    endGame(r, 0);
    run(r, 1);
    expect(players[0]!.conn.last('lobbyState')).toMatchObject({ phase: 'vote', gameNo: 2, seriesRed: 1, seriesBlue: 0 });
    run(r, 200);
    expect([r.finished, alive(r)]).toEqual([false, 0]);
    play(r, players);
    endGame(r, 0);
    run(r, 1);
    expect(players[0]!.conn.last('lobbyState')).toMatchObject({ phase: 'finished', gameNo: 2, seriesRed: 2 });
    run(r, 200);
    expect(r.finished).toBe(true);
  });

  describe('partida cancelada sem humanos de um lado (OG-345, RN-RKL-26)', () => {
    const setup = () => {
      const reports: unknown[] = [];
      const r = new Room({ id: 'r-2', preset: 'ranked', maps, mapFiles: ['outgun1', '2 versus 2 (duel)'], maxPlayers: 6, seed: 3, ranked: { format: '3x3', bestOf: 3 }, reportMatch: (m) => void reports.push(m) });
      const players = [1, 2, 3, 4, 5, 6].map((n) => join(r, n));
      run(r, 1);
      play(r, players);
      for (const p of players) r.handle(p.pid, [message('clientReady', {})]);
      run(r, 30);
      const side = (team: number) => players.filter((p) => r.world.teamOf(p.pid) === team);
      return { r, players, side, reports };
    };
    const cancelled = (c: TestConnection) => c.received.some((m) => m.type === 'text' && m.text.startsWith('Partida cancelada'));

    it('um time inteiro cai e ninguém volta no prazo: cancela, sem bot nem resultado; o jogo é disputado de novo', () => {
      const { r, side, reports } = setup();
      for (const p of side(0)) r.disconnect(p.pid, p.conn);
      run(r, RANKED_RECONNECT_FRAMES);
      expect(r.lobby?.phase).toBe('game'); // ainda no prazo
      run(r, 3);
      const stay = side(1)[0]!;
      expect(cancelled(stay.conn)).toBe(true);
      expect([r.lobby?.phase, r.playerCount, r.bots()]).toEqual(['lobby', 3, []]);
      expect(reports).toEqual([]);
      expect(stay.conn.last('lobbyState')).toMatchObject({ gameNo: 1, seriesRed: 0, seriesBlue: 0 });
    });

    it('todos saem com "Sair": cancela na hora', () => {
      const { r, players, reports } = setup();
      for (const p of players) r.disconnect(p.pid, p.conn, true);
      run(r, 2);
      expect([r.lobby?.phase, r.playerCount, reports]).toEqual(['lobby', 0, []]);
    });

    it('quem volta no prazo mantém o jogo; com um humano ainda do lado, segue a regra do voto', () => {
      const { r, side } = setup();
      const [a, b] = side(0);
      r.disconnect(a!.pid, a!.conn, true);
      r.disconnect(b!.pid, b!.conn);
      run(r, 10);
      expect(r.lobby?.phase).toBe('game'); // b ainda pode voltar e c está conectado
      const c = side(0)[2]!;
      r.disconnect(c.pid, c.conn);
      run(r, 10);
      expect(r.resume(new TestConnection(), { name: 'J', accountId: `00000000-0000-4000-8000-00000000000${c.pid + 1}` }, '')).toMatchObject({ ok: true });
      run(r, RANKED_RECONNECT_FRAMES + 5);
      expect([r.lobby?.phase, cancelled(c.conn)]).toEqual(['game', false]);
    });
  });
});
