// SPDX-License-Identifier: GPL-2.0-or-later
import { message, type AnyMessage, type MessageOf } from '@outgun/protocol';
import { CONTROL, GameMap, Position } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { SimulatedLink } from './link.js';
import { ClientSession, delta, offsetPosition, type SessionEvent } from './session.js';

/** Mapa 2×2 sem paredes. */
const MAP = new GameMap(2, 2, 'teste', 'ninguém', 0);

function session() {
  const sent: AnyMessage[] = [];
  const events: SessionEvent[] = [];
  const s: ClientSession = new ClientSession({
    send: (m) => sent.push(...m),
    onMapChange: () => s.setMap(MAP),
    onEvent: (e) => events.push(e),
  });
  s.handle(
    [
      message('welcome', { protocol: 1, pid: 0, color: 0, maxPlayers: 4, mode: 'casual', mapIndex: 0, redScore: 0, blueScore: 0 }),
      message('mapChange', { reason: 'other', mapIndex: 0, file: 'teste', title: 'teste', crc: 0 }),
      message('playerJoined', { pid: 0, name: 'Eu', color: 0, bot: false }),
      message('playerJoined', { pid: 2, name: 'Outro', color: 0, bot: false }),
    ],
    0,
  );
  return { s, sent, events };
}

type FramePlayer = MessageOf<'frame'>['players'][number];
const player = (pid: number, x: number, y: number, vx = 0, vy = 0, controls = 0): FramePlayer => ({
  pid,
  x,
  y,
  vx,
  vy,
  dead: false,
  deathbringer: false,
  deathbringerAffected: false,
  shield: false,
  turbo: false,
  power: false,
  controls,
  gundir: 0,
  visibility: 255,
});

function frame(n: number, players: FramePlayer[], lastClientFrame = 0) {
  const me = players.find((p) => p.pid === 0);
  return message('frame', {
    frame: n,
    lastClientFrame,
    frameOffset: 128,
    skipped: false,
    self: me ? { roomX: 0, roomY: 0, x: me.x, y: me.y, vx: me.vx, vy: me.vy, health: 100, energy: 100 } : null,
    players,
    minimap: [],
    ping: null,
  });
}

describe('ClientSession', () => {
  it('entra: guarda pid, jogadores e confirma o mapa', () => {
    const { s, sent } = session();
    expect(s.me).toBe(0);
    expect(s.world?.players[2]).toBeDefined();
    expect(s.names.get(2)).toBe('Outro');
    expect(sent.map((m) => m.type)).toEqual(['clientReady']);
  });

  it('ignora frame atrasado e aplica o mais novo', () => {
    const { s } = session();
    s.handle([frame(10, [player(0, 100, 100)])], 1000);
    s.handle([frame(9, [player(0, 50, 50)])], 1010);
    expect(s.world?.frame).toBe(10);
    expect(s.world?.players[0]?.pos.x).toBe(100);
  });

  it('extrapola jogadores parados sem mexer e os em movimento pela velocidade', () => {
    const { s } = session();
    s.prediction = { enabled: false, amount: 10 };
    s.handle([frame(10, [player(0, 100, 100), player(2, 200, 100, 10, 0, CONTROL.right)])], 1000);
    const fd = s.extrapolate(1050);
    expect(fd?.players[0]?.pos.x).toBeCloseTo(100);
    // meio frame: acelerou e andou metade
    expect(fd?.players[2]?.pos.x).toBeGreaterThan(204);
    expect(fd?.players[2]?.pos.x).toBeLessThan(210);
  });

  it('predição: aplica os controles enviados e ainda não confirmados', () => {
    const { s, sent } = session();
    s.handle([frame(10, [player(0, 100, 100)])], 1000);
    s.setControls(CONTROL.right, 1010);
    s.sendFrame(1050); // clientFrame 1, não confirmado
    const input = sent.at(-1) as MessageOf<'input'>;
    expect(input.controls).toBe(CONTROL.right);
    // muita latência medida: extrapola o frame inteiro com "direita"
    const fd = s.extrapolate(1099);
    expect(fd?.players[0]?.pos.x).toBeGreaterThan(100);
    s.prediction = { enabled: false, amount: 10 };
    expect(s.extrapolate(1099)?.players[0]?.pos.x).toBeCloseTo(100);
  });

  it('reenvia no meio do frame quando a tecla muda logo depois do envio', () => {
    const { s, sent } = session();
    s.handle([frame(10, [player(0, 100, 100)])], 1000);
    s.sendFrame(1040);
    s.setControls(CONTROL.up, 1045);
    const inputs = sent.filter((m): m is Extract<AnyMessage, { type: 'input' }> => m.type === 'input');
    expect(inputs.map((m) => [m.clientFrame, m.controls])).toEqual([
      [1, 0],
      [1, CONTROL.up],
    ]);
    // tarde demais para o mesmo frame: vai no próximo envio
    s.setControls(CONTROL.down, 1095);
    expect(sent.filter((m) => m.type === 'input')).toHaveLength(2);
  });

  it('contador de 8 bits dá a volta', () => {
    const { s, sent } = session();
    for (let i = 0; i < 300; i++) s.sendFrame(i * 100);
    expect((sent.at(-1) as MessageOf<'input'>).clientFrame).toBe(300 % 256);
  });

  it('o envio se ajusta pelo frameOffset (média de 10 frames)', () => {
    const { s } = session();
    let delay = 0;
    for (let i = 0; i < 10; i++) {
      const f = frame(10 + i, [player(0, 100, 100)]);
      f.frameOffset = 230; // chegando tarde (0,9 frame)
      s.handle([f], 1000 + i * 100);
      delay = s.sendFrame(1000 + i * 100 + 50);
    }
    expect(delay).toBeCloseTo(100 - 100 * (230 / 256 - 0.5));
  });

  it('foguetes do tiro esperam o frame e nascem como no servidor', () => {
    const { s, events } = session();
    s.handle([frame(10, [player(0, 100, 100)])], 1000);
    s.handle([message('rocketFire', { owner: 0, rockets: [5], gundir: 0, frame: 11, power: false, roomX: 0, roomY: 0, x: 100, y: 100 })], 1100);
    expect(s.world?.rockets[5]?.owner).toBe(-1);
    s.handle([frame(11, [player(0, 100, 100)])], 1100);
    const rk = s.world!.rockets[5]!;
    expect(rk.owner).toBe(0);
    expect(rk.pos.x).toBeCloseTo(115); // 15 px à frente
    s.handle([frame(13, [player(0, 100, 100)])], 1300);
    expect(rk.pos.x).toBeCloseTo(115 + 2 * 50);
    expect(events.some((e) => e.kind === 'rocketFired')).toBe(true);
  });

  it('foguete apagado com alvo faz o alvo piscar e gera explosão', () => {
    const { s, events } = session();
    s.handle([frame(10, [player(0, 100, 100)]), message('rocketFire', { owner: 2, rockets: [1], gundir: 0, frame: 10, power: false, roomX: 0, roomY: 0, x: 10, y: 100 })], 1000);
    s.handle([message('rocketDelete', { rocket: 1, target: 0, x: 90, y: 100 })], 1100);
    expect(s.world?.rockets[1]?.owner).toBe(-1);
    expect(s.hitUntil.get(0)).toBe(1400);
    expect(events.some((e) => e.kind === 'rocketHitPlayer' && e.target === 0)).toBe(true);
  });

  it('bandeira largada guarda a hora em que caiu', () => {
    const { s } = session();
    s.handle([frame(10, [player(0, 100, 100)])], 1000);
    s.handle([message('flagUpdate', { team: 'red', flags: [{ carried: false, carrier: 255, roomX: 0, roomY: 0, x: 50, y: 50 }] })], 1000);
    s.handle([message('flagUpdate', { team: 'red', flags: [{ carried: true, carrier: 2, roomX: 0, roomY: 0, x: 50, y: 50 }] })], 1000);
    expect(s.carriedFlag(2)).toBe(2); // pid 2 é do time azul: a vermelha é inimiga
    s.handle([frame(20, [player(0, 100, 100)])], 2000);
    s.handle([message('flagUpdate', { team: 'red', flags: [{ carried: false, carrier: 255, roomX: 1, roomY: 0, x: 70, y: 80 }] })], 2000);
    const f = s.world!.teams[0].flags[0]!;
    expect(f.status).toBe('dropped');
    expect(f.dropTime).toBe(2);
  });

  it('suaviza a correção de um jogador remoto em vez de pular', () => {
    const { s } = session();
    s.prediction = { enabled: false, amount: 10 };
    s.handle([frame(10, [player(0, 100, 100), player(2, 200, 100, 10, 0, CONTROL.right)])], 1000);
    s.extrapolate(1090);
    // ele parou de repente: a nova extrapolação está ~10 px atrás
    s.handle([frame(11, [player(0, 100, 100), player(2, 205, 100, 0, 0, 0)])], 1100);
    const x1 = s.extrapolate(1100)!.players[2]!.pos.x;
    expect(x1).toBeGreaterThan(210);
    const x2 = s.extrapolate(1500)!.players[2]!.pos.x;
    expect(x2).toBeCloseTo(205, 0);
  });
});

describe('geometria do mapa toroidal', () => {
  it('delta pega o caminho mais curto pela volta do mapa', () => {
    const a = new Position(0, 0, 5, 5);
    const b = new Position(1, 1, 467, 349);
    expect(delta(a, b, MAP)).toEqual({ x: 10, y: 10 });
  });

  it('offsetPosition troca de sala e dá a volta', () => {
    const p = offsetPosition(new Position(1, 0, 470, 10), 5, -20, MAP);
    expect([p.roomX, p.roomY, p.x, p.y]).toEqual([0, 1, 3, 344]);
  });
});

describe('SimulatedLink', () => {
  it('perda segura os pacotes seguintes (entrega em ordem)', () => {
    const link = new SimulatedLink<number>({ rttMs: 100, jitterMs: 0, loss: 1 }, 1);
    link.send(1, 0);
    link.conditions = { rttMs: 100, jitterMs: 0, loss: 0 };
    link.send(2, 10);
    expect(link.receive(100)).toEqual([]);
    expect(link.receive(1000)).toEqual([1, 2]);
  });
});
