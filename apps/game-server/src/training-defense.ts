// SPDX-License-Identifier: GPL-2.0-or-later
// Treino Defesa (OG-494, RN-TRN-04): segurar a onda de atacantes que saem juntos. Os atacantes só
// atacam a bandeira (sem voltar para defender); os aliados só guardam a base (D-87).
import { OPPONENT_TEAM, opponents, outOfBaseRoom, TRAINEE_TEAM, traineeDeath, type BotSlot, type TrainingModeDef } from './training.js';

export const defenseMode: TrainingModeDef = {
  roster: (ctx) => [
    ...Array.from({ length: ctx.config.bots }, (): BotSlot => ({ team: OPPONENT_TEAM, role: 'attack' })),
    ...Array.from({ length: ctx.config.allies }, (): BotSlot => ({ team: TRAINEE_TEAM, role: 'guard' })),
  ],
  place: (ctx, players) => {
    const out = new Map<number, ReturnType<typeof ctx.spot>>();
    const home = ctx.baseRoom(TRAINEE_TEAM);
    const flag = ctx.map.teams[TRAINEE_TEAM].flags[0];
    const wave = ctx.roomOnPath(TRAINEE_TEAM, OPPONENT_TEAM, 2); // a onda sai junta, de fora da sala da base
    for (const p of players) out.set(p.pid, p.team === TRAINEE_TEAM ? ctx.spot(home, flag) : ctx.spot(wave));
    return out;
  },
  judge: (world, ev) => {
    const died = traineeDeath(world, ev);
    if (died) return died;
    for (const p of world.players()) {
      if (p.team === OPPONENT_TEAM && !p.dead && p.carrying === TRAINEE_TEAM && outOfBaseRoom(world.map, TRAINEE_TEAM, p.pos)) return { success: false, reason: 'flagOut' };
    }
    if (ev.kind === 'capture' && world.players().find((p) => p.pid === ev.pid)?.team === OPPONENT_TEAM) return { success: false, reason: 'flagOut' };
    const wave = opponents(world);
    if (wave.length > 0 && wave.every((p) => p.dead)) return { success: true, reason: 'attackersDown' };
    return null;
  },
};
