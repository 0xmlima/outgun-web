// SPDX-License-Identifier: GPL-2.0-or-later
// Consultas do bot sobre a situação do jogo (src/robot.cpp:89-125, 860-905, 1159-1395): quem está em
// cada área, explosões de deathbringer, bandeiras nas bases.
import { FLAG_RADIUS, PLAYER_RADIUS, Vec, type DeathbringerExplosion, type FlagState, type WorldCoords } from '@outgun/sim';
import type { Area, Neighbor } from './areamap.js';
import { FADEOUT, type RobotCore } from './robot-core.js';
import type { BotPlayer } from './view.js';

export interface TeamCounts {
  enemies: number;
  friends: number;
}

/** Explosão perigosa para mim na sala (inimiga, ou qualquer uma com `friendly_db`). */
export function explosionInRoom(bot: RobotCore, roomX: number, roomY: number): DeathbringerExplosion | null {
  for (const db of bot.fx.world.explosions) {
    if (db.pos.roomX === roomX && db.pos.roomY === roomY && (db.ownerTeam !== bot.myTeam() || bot.fx.physics.friendlyDeathbringer)) {
      return db;
    }
  }
  return null;
}

/** Alguém na sala com deathbringer prestes a explodir (`imminentExplosionHere`). */
export function imminentExplosionHere(bot: RobotCore): boolean {
  for (const pl of bot.fx.players) {
    if (!pl.used || pl.dead || !bot.here(pl, true)) continue;
    if (bot.isMyTeam(pl) && !bot.fx.physics.friendlyDeathbringer) continue;
    if (pl.deathbringer && pl.underDeathbringerEffect()) return true;
  }
  return false;
}

/** A sala do vizinho ainda terá a explosão quando eu chegar? */
export function dangerousExplosionInNeighbor(bot: RobotCore, neighbor: Neighbor): boolean {
  const dbe = explosionInRoom(bot, neighbor.area.room.x, neighbor.area.room.y);
  if (!dbe) return false;
  // ignora que com turbo chegaríamos antes
  const minMoveTime = bot.distanceFromDoor(neighbor) / bot.fx.physics.maxRunSpeed;
  return !dbe.expired(bot.fx.frame + bot.averageLag + minMoveTime);
}

/** Quem tem prioridade para defender entre mim e `player` (`moreDefensive`). */
export function moreDefensive(bot: RobotCore, player: BotPlayer): boolean {
  if (bot.haveFlag(player.pid)) return true;
  const me = bot.player(bot.me);
  if ((bot.here(player, true) || bot.fx.rules.seeMinimapPlayerProperties >= 1) && player.turbo !== me.turbo) return !player.turbo;
  if (player.name.substring(0, 4) === 'BOT ') return player.pid < bot.me;
  return player.defending;
}

/** Inimigos (vistos recentemente) e amigos vivos numa área (`Teams`). */
export function teams(bot: RobotCore, a: Area, countMe: boolean): TeamCounts {
  const c: TeamCounts = { enemies: 0, friends: 0 };
  let meFound = false;
  const fx = bot.fx;
  for (let i = 0; i < fx.maxPlayers; ++i) {
    const pl = bot.player(i);
    if (!pl.used || bot.areaOf(pl.pos) !== a || pl.dead) continue;
    if (bot.isMyTeam(pl)) {
      if (i === bot.me) meFound = true;
      c.friends++;
    }
  }
  for (let i = 0; i < fx.maxPlayers; ++i) {
    const pl = bot.player(i);
    if (!pl.used || bot.areaOf(pl.pos) !== a || pl.dead) continue;
    if (!bot.isMyTeam(pl)) {
      if (fx.frame - pl.posUpdated > FADEOUT) continue;
      if (fx.enemiesSeen(pl.pos.roomX, pl.pos.roomY) > pl.posUpdated) continue;
      c.enemies++;
    }
  }
  if (meFound && !countMe) --c.friends;
  return c;
}

/** Sou o companheiro de maior pid na área? (`AmILast`) */
export function amILast(bot: RobotCore): boolean {
  for (let i = 0; i < bot.fx.maxPlayers; ++i) {
    const pl = bot.player(i);
    if (!pl.used || pl.dead || !bot.here(pl)) continue;
    if (bot.isMyTeam(pl) && i > bot.me) return false;
  }
  return true;
}

/** A área tem uma base do meu time? (`IsHome`) */
export function isHome(bot: RobotCore, a: Area | null): boolean {
  for (const base of basesOf(bot, bot.myTeam())) {
    if (bot.areaMap.identifyArea(base) === a) return true;
  }
  return false;
}

export function getPlayers(bot: RobotCore, team: number): number {
  return bot.fx.players.filter((p) => p.used && p.team === team).length;
}

export function teamHasFlags(bot: RobotCore, carrierTeam: number, flagTeam: number): boolean {
  return bot.fx.world.flagsOf(flagTeam).some((f) => f.status === 'carried' && bot.player(f.carrier).team === carrierTeam);
}

/** A bandeira está numa base do time (perto o bastante para capturar, ou a 5 px)? (`IsFlagAtBase`) */
export function isFlagAtBase(bot: RobotCore, f: FlagState, team: number, captureableEnough: boolean): boolean {
  if (f.status === 'carried') return false;
  const bases = basesOf(bot, team);
  for (const base of bases) {
    // raio da bandeira + do jogador para tocá-la, e mais um da bandeira para tocar a base também
    const threshold = captureableEnough ? 2 * FLAG_RADIUS + PLAYER_RADIUS : 5;
    if (base.room.x === f.pos.roomX && base.room.y === f.pos.roomY && new Vec(base.x - f.pos.x, base.y - f.pos.y).mag() <= threshold) {
      return true;
    }
  }
  return false;
}

/**
 * Bases do time 0, 1 ou das bandeiras selvagens (2) no mapa do cliente. O original lê
 * `map.tinfo[team].flags` também com `team == 2`, fora do vetor de 2 times; pelo layout de `Map` isso
 * cai exatamente em `map.wild_flags`, que é o que se usa aqui.
 */
export function basesOf(bot: RobotCore, team: number): readonly WorldCoords[] {
  return bot.fx.bases[team as 0 | 1 | 2];
}

export function isAnyFlagAtBase(bot: RobotCore, team: number): boolean {
  return bot.fx.world.flagsOf(team).some((f) => isFlagAtBase(bot, f, team, true));
}

/** O inimigo carrega bandeira minha (ou selvagem) sem ser visto? (`EnemyHasUnseenFlags`) */
export function enemyHasUnseenFlags(bot: RobotCore, wild: boolean): boolean {
  const fx = bot.fx;
  for (const f of fx.world.flagsOf(wild ? 2 : bot.myTeam())) {
    if (f.status !== 'carried') continue;
    const pl = bot.player(f.carrier);
    if (!pl.used || pl.pos.roomX >= fx.map.width || pl.pos.roomY >= fx.map.height) return true;
    if (bot.isMyTeam(pl)) continue;
    if (pl.posUpdated < Math.max(fx.frame - FADEOUT, fx.enemiesSeen(pl.pos.roomX, pl.pos.roomY))) return true;
  }
  return false;
}
