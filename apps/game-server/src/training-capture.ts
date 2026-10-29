// SPDX-License-Identifier: GPL-2.0-or-later
// Treino Captura (OG-496, RN-TRN-04): alcançar quem levou a sua bandeira e devolvê-la antes da entrega.
// Um bot só leva a bandeira para casa e a escolta só escolta (D-87). Cenário variado a cada tentativa
// (P6): quantos escoltam (até o máximo da sala) e de que sala, ao redor da base, quem treina sai.
import { OPPONENT_TEAM, TRAINEE_TEAM, traineeDeath, type BotSlot, type TrainingModeDef } from './training.js';

export const captureMode: TrainingModeDef = {
  roster: (ctx) => {
    const escorts = ctx.config.bots === 0 ? 0 : ctx.rng.rand() % (ctx.config.bots + 1);
    return [{ team: OPPONENT_TEAM, role: 'carry' }, ...Array.from({ length: escorts }, (): BotSlot => ({ team: OPPONENT_TEAM, role: 'escort' }))];
  },
  // o portador pega a sua bandeira no primeiro frame
  pickup: (ctx, players) => {
    const carrier = players.find((p) => p.role === 'carry');
    return new Map(carrier ? [[carrier.pid, ctx.flagSpot(TRAINEE_TEAM)]] : []);
  },
  place: (ctx, players) => {
    const out = new Map<number, ReturnType<typeof ctx.spot>>();
    const home = ctx.baseRoom(TRAINEE_TEAM);
    const start = ctx.roomAround(TRAINEE_TEAM, 1 + (ctx.rng.rand() % 2)); // vantagem do portador: 1 ou 2 salas
    // o portador num ponto sorteado da sua base; a escolta perto dele
    const carrier = players.find((p) => p.role === 'carry');
    const carrierPos = carrier ? ctx.spot(home) : null;
    if (carrier && carrierPos) out.set(carrier.pid, carrierPos);
    for (const p of players) {
      if (p === carrier) continue;
      if (p.team === TRAINEE_TEAM) out.set(p.pid, ctx.spot(start));
      else out.set(p.pid, ctx.spot(home, carrierPos ? { room: home, x: carrierPos.x, y: carrierPos.y } : undefined));
    }
    return out;
  },
  judge: (world, ev) => {
    const died = traineeDeath(world, ev);
    if (died) return died;
    const who = 'pid' in ev ? world.players().find((p) => p.pid === ev.pid) : undefined;
    if (ev.kind === 'capture' && who?.team === OPPONENT_TEAM) return { success: false, reason: 'delivered' };
    if (ev.kind === 'return' && who?.team === TRAINEE_TEAM) return { success: true, reason: 'returned' };
    return null;
  },
};
