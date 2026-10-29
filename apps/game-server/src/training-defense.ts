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
    // a onda sai junta, de uma sala sorteada a 1 ou 2 salas da base: a direção do ataque varia (OG-500)
    const wave = ctx.roomAround(TRAINEE_TEAM, 1 + (ctx.rng.rand() % 2));
    let leader: ReturnType<typeof ctx.spot> | null = null;
    for (const p of players) {
      if (p.team === TRAINEE_TEAM) out.set(p.pid, ctx.spot(home)); // você e os aliados em qualquer ponto da base
      else {
        const pos = ctx.spot(wave, leader ? { room: wave, x: leader.x, y: leader.y } : undefined);
        leader ??= pos;
        out.set(p.pid, pos);
      }
    }
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
