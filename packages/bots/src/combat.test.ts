// SPDX-License-Identifier: GPL-2.0-or-later
// Combate (OG-052): o bot não atira quando o foguete acertaria um companheiro antes do inimigo, mira
// e foge de foguetes. Sala vazia de 1×1 para as contas ficarem óbvias.
import { classicSettings } from '@outgun/settings';
import { GameMap, GlibcRand, Position, Vec } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { AreaMap } from './areamap.js';
import {
  AIM_THRESHOLD,
  AimLevel,
  NO_HIT_TIME,
  escapeRocket,
  getDangerousRocket,
  getHitTeammateTime,
  getHitTime,
  needShootTradTurning,
  tryAimTradTurning,
} from './combat.js';
import { Ctl, RobotCore } from './robot-core.js';
import { BotView } from './view.js';

const map = new GameMap(1, 1, 'vazio', 'teste', 0);
const areaMap = new AreaMap(map);

/** Eu (pid 0, time 0) e outros jogadores parados nas posições dadas, todos vistos neste frame. */
function setup(friendlyFire: number, others: { pid: number; x: number; y: number }[], me = { x: 100, y: 177 }): RobotCore {
  const physics = { ...classicSettings().physics, friendlyFire };
  const view = new BotView(map, 16, physics, {
    carryOwnTeamFlag: false,
    captureAwayFromBase: false,
    lockTeamFlags: false,
    lockWildFlags: false,
    captureOnTeamFlags: true,
    captureOnWildFlags: false,
    seeMinimapPlayerProperties: 0,
  });
  view.frame = 100;
  for (const p of [{ pid: 0, ...me }, ...others]) {
    const pl = view.players[p.pid]!;
    pl.used = true;
    pl.pos = new Position(0, 0, p.x, p.y);
    pl.posUpdated = 100;
  }
  view.syncUsed();
  const bot = new RobotCore(view, areaMap, 0, new GlibcRand(1));
  bot.futureMe = view.players[0]!.cloneBot();
  bot.averageLag = 1.5;
  bot.myGundir = 0;
  return bot;
}

describe('tiro sem acertar companheiro (GetHitTeammateTime)', () => {
  // inimigo (pid 8, time 1) à direita; companheiro (pid 1) no meio do caminho
  const between = [
    { pid: 1, x: 200, y: 177 },
    { pid: 8, x: 350, y: 177 },
  ];

  it('com fogo amigo, não atira se o companheiro está antes do inimigo', () => {
    const bot = setup(0.5, between);
    expect(getHitTime(bot, 0, 8)).toBeLessThan(NO_HIT_TIME);
    expect(getHitTeammateTime(bot, 0)).toBeLessThan(getHitTime(bot, 0, 8));
    expect(needShootTradTurning(bot)).toEqual([false, -1]);
  });

  it('sem fogo amigo, atira mesmo com o companheiro no caminho', () => {
    const bot = setup(0, between);
    expect(getHitTeammateTime(bot, 0)).toBe(NO_HIT_TIME);
    expect(needShootTradTurning(bot)).toEqual([true, 0]);
  });

  it('com fogo amigo, atira se o companheiro está atrás do inimigo', () => {
    const bot = setup(0.5, [
      { pid: 1, x: 420, y: 177 },
      { pid: 8, x: 300, y: 177 },
    ]);
    expect(getHitTime(bot, 0, 8)).toBeLessThan(getHitTeammateTime(bot, 0));
    expect(needShootTradTurning(bot)).toEqual([true, 0]);
  });

  it('com fogo amigo, troca para outra direção livre', () => {
    // inimigo na diagonal de baixo (direção 1) e companheiro bloqueando a direita
    const bot = setup(0.5, [
      { pid: 1, x: 200, y: 177 },
      { pid: 8, x: 350, y: 177 },
      { pid: 9, x: 200, y: 277 },
    ]);
    expect(needShootTradTurning(bot)).toEqual([true, 1]);
  });
});

describe('mira e esquiva', () => {
  it('alvo parado na linha: mira cheia; fora da linha além do limiar: quase', () => {
    expect(tryAimTradTurning(setup(0, [{ pid: 8, x: 300, y: 177 }]), 8)).toEqual([AimLevel.Full, 0]);
    expect(tryAimTradTurning(setup(0, [{ pid: 8, x: 300, y: 177 + AIM_THRESHOLD + 1 }]), 8)).toEqual([AimLevel.Near, 0]);
  });

  it('alvo em movimento: mira na frente dele', () => {
    const bot = setup(0, [{ pid: 8, x: 300, y: 100 }]);
    bot.player(8).vel = new Vec(0, 25); // descendo para a minha linha
    const [, dir] = tryAimTradTurning(bot, 8);
    expect(dir).toBe(0);
  });

  it('foguete vindo na minha direção é perigoso e o bot foge de lado', () => {
    const bot = setup(0, [{ pid: 8, x: 400, y: 177 }]);
    const r = bot.fx.world.rockets[0]!;
    r.owner = 8;
    r.team = 1;
    r.pos = new Position(0, 0, 250, 177);
    r.vel = new Vec(-50, 0);
    expect(getDangerousRocket(bot)).toBe(0);
    const ctrl = escapeRocket(bot, 0);
    expect(ctrl & Ctl.strafe).toBeTruthy();
    expect(ctrl & (Ctl.up | Ctl.down)).toBeTruthy(); // sai da linha do foguete
  });

  it('foguete do próprio time sem fogo amigo não é perigoso', () => {
    const bot = setup(0, []);
    const r = bot.fx.world.rockets[0]!;
    r.owner = 1;
    r.team = 0;
    r.pos = new Position(0, 0, 250, 177);
    r.vel = new Vec(-50, 0);
    expect(getDangerousRocket(bot)).toBe(-1);
  });
});
