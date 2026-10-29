// SPDX-License-Identifier: GPL-2.0-or-later
// Treino Fuga (OG-495, RN-TRN-04): da base inimiga até a sua, já com a bandeira, com perseguidores no
// encalço. Os bots só perseguem (D-87): nenhum pega bandeira nem espera na sua base.
import { OPPONENT_TEAM, TRAINEE_TEAM, traineeDeath, type TrainingModeDef } from './training.js';

export const escapeMode: TrainingModeDef = {
  roster: (ctx) => Array.from({ length: ctx.config.bots }, () => ({ team: OPPONENT_TEAM, role: 'chase' as const })),
  // o primeiro de quem treina pega a bandeira inimiga no primeiro frame
  pickup: (ctx, players) => {
    const first = players.find((p) => p.team === TRAINEE_TEAM);
    return new Map(first ? [[first.pid, ctx.flagSpot(OPPONENT_TEAM)]] : []);
  },
  place: (ctx, players) => {
    const out = new Map<number, ReturnType<typeof ctx.spot>>();
    const base = ctx.baseRoom(OPPONENT_TEAM);
    // os perseguidores saem de uma sala sorteada a 1 ou 2 salas da base: quem foge tem um instante de
    // vantagem, e a direção de onde vêm varia (OG-500)
    const behind = ctx.roomAround(OPPONENT_TEAM, 1 + (ctx.rng.rand() % 2));
    for (const p of players) out.set(p.pid, ctx.spot(p.team === TRAINEE_TEAM ? base : behind));
    return out;
  },
  judge: (world, ev) => {
    const died = traineeDeath(world, ev);
    if (died) return died;
    if (ev.kind === 'capture' && world.players().find((p) => p.pid === ev.pid)?.team === TRAINEE_TEAM) return { success: true, reason: 'captured' };
    return null;
  },
};
