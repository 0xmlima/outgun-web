// SPDX-License-Identifier: GPL-2.0-or-later
// Treino Ataque (OG-493, RN-TRN-04): entrar na base defendida e sair do quadrado com a bandeira.
// Os bots só guardam a base (D-87): nenhum sai da sala da base nem vai atrás da bandeira de quem treina.
import { OPPONENT_TEAM, opponents, outOfBaseRoom, TRAINEE_TEAM, traineeDeath, type TrainingModeDef } from './training.js';

export const attackMode: TrainingModeDef = {
  roster: (ctx) => Array.from({ length: ctx.config.bots }, () => ({ team: OPPONENT_TEAM, role: 'guard' as const })),
  place: (ctx, players) => {
    const out = new Map<number, ReturnType<typeof ctx.spot>>();
    // fora da sala da base inimiga, numa sala vizinha sorteada: a porta de entrada varia (OG-500)
    const start = ctx.roomAround(OPPONENT_TEAM, 1);
    const base = ctx.baseRoom(OPPONENT_TEAM);
    const flag = ctx.map.teams[OPPONENT_TEAM].flags[0];
    for (const p of players) out.set(p.pid, p.team === TRAINEE_TEAM ? ctx.spot(start) : ctx.spot(base, flag));
    return out;
  },
  judge: (world, ev) => {
    const died = traineeDeath(world, ev);
    if (died) return died;
    const defenders = opponents(world);
    if (defenders.length > 0 && defenders.every((p) => p.dead)) return { success: true, reason: 'defendersDown' };
    for (const p of world.players()) {
      if (p.team === TRAINEE_TEAM && !p.dead && p.carrying === OPPONENT_TEAM && outOfBaseRoom(world.map, OPPONENT_TEAM, p.pos)) return { success: true, reason: 'flagOut' };
    }
    return null;
  },
};
