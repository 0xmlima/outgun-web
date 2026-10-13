// SPDX-License-Identifier: GPL-2.0-or-later
// Propriedade da navegação (OG-051): sozinho no mapa, com destino fixo, o bot chega a qualquer área
// alcançável sem ficar preso. O movimento usa a física da sim, como no jogo.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMapFile } from '@outgun/content';
import { classicSettings } from '@outgun/settings';
import {
  GlibcRand,
  PLAYER_RADIUS,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  Vec,
  applyPhysicsToPlayerInIsolation,
  applyPlayerAcceleration,
  gunDirectionFromControls,
  isStrafe,
} from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { AreaMap, type Area } from './areamap.js';
import { DistanceTableId } from './distance.js';
import { moveToDestination, setDestination } from './navigation.js';
import { DestinationType, RobotCore } from './robot-core.js';
import { BotView } from './view.js';

const repoRoot = join(import.meta.dirname, '../../..');
const PHYSICS = classicSettings().physics;

function loadAreaMap(file: string): AreaMap {
  const r = parseMapFile(file, readFileSync(join(repoRoot, file)));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return new AreaMap(r.map);
}

/** Um ponto livre (cabe um jogador) dentro da área, perto do centro dos pontos livres. */
function pointIn(am: AreaMap, area: Area): Vec | null {
  const room = am.map.room(area.room);
  const free: Vec[] = [];
  for (let x = PLAYER_RADIUS + 2; x < ROOM_WIDTH - PLAYER_RADIUS; x += 8) {
    for (let y = PLAYER_RADIUS + 2; y < ROOM_HEIGHT - PLAYER_RADIUS; y += 8) {
      const p = new Vec(x, y);
      if (am.identifyArea({ room: area.room, x, y }) === area && !room.fallOnWallCirc(p, PLAYER_RADIUS + 2)) free.push(p);
    }
  }
  if (free.length === 0) return null;
  const c = free.reduce((s, p) => s.add(p), new Vec(0, 0)).div(free.length);
  return free.reduce((best, p) => (p.sub(c).mag2() < best.sub(c).mag2() ? p : best));
}

/** Frames até chegar (ou −1 se não chegou em `maxFrames`). */
function travel(am: AreaMap, from: Area, start: Vec, to: Area, rng: GlibcRand, maxFrames: number): number {
  const view = new BotView(am.map, 2, PHYSICS, {
    carryOwnTeamFlag: false,
    captureAwayFromBase: false,
    lockTeamFlags: true,
    lockWildFlags: true,
    captureOnTeamFlags: true,
    captureOnWildFlags: false,
    seeMinimapPlayerProperties: 0,
  });
  const me = view.players[0]!;
  me.used = true;
  me.pos.roomX = from.room.x;
  me.pos.roomY = from.room.y;
  me.pos.x = start.x;
  me.pos.y = start.y;
  view.syncUsed();
  const bot = new RobotCore(view, am, 0, rng);
  bot.destinationType = DestinationType.Team;
  const ctx = { world: view.world, physics: view.physics };
  for (let frame = 0; frame < maxFrames; ++frame) {
    view.frame = frame;
    me.posUpdated = frame;
    bot.futureMe = me.cloneBot();
    bot.averageLag = 0.5;
    if (bot.myGundir === -1) bot.myGundir = 0;
    setDestination(bot, to);
    if (bot.myArea() === to) return frame;
    const ctrl = moveToDestination(bot);
    if (!isStrafe(ctrl)) me.gundir = gunDirectionFromControls(me.gundir, ctrl);
    bot.myGundir = Math.round(me.gundir) % 8;
    me.controls = ctrl;
    applyPlayerAcceleration(ctx, me);
    applyPhysicsToPlayerInIsolation(ctx, me, PLAYER_RADIUS, 1);
  }
  return -1;
}

describe('navegação até destinos (OG-051)', () => {
  it.each(['maps/outgun1.txt', 'maps/verde.txt', 'cmaps/ksii.txt'])('%s: chega a todas as áreas alcançáveis', (file) => {
    const am = loadAreaMap(file);
    const rng = new GlibcRand(51);
    const stuck: string[] = [];
    let pairs = 0;
    let frames = 0;
    for (const from of am.areas) {
      const start = pointIn(am, from);
      if (!start) continue;
      const probe = new RobotCore(new BotView(am.map, 2, PHYSICS, {} as never), am, 0, rng);
      probe.tables.build(DistanceTableId.Main, from, 0, 0);
      for (const to of am.areas) {
        if (to === from || probe.distance(DistanceTableId.Main, to) === -1) continue;
        pairs++;
        // até 6 s por sala de distância, com folga
        const budget = 60 * (probe.distance(DistanceTableId.Main, to) / 1000) + 100;
        const f = travel(am, from, start, to, rng, budget);
        if (f === -1) stuck.push(`${from.index}→${to.index}`);
        else frames += f;
      }
    }
    expect(pairs).toBeGreaterThan(100);
    expect(stuck).toEqual([]);
    expect(frames / pairs).toBeGreaterThan(10); // viagens de verdade (média de 35 a 67 frames)
  });
});
