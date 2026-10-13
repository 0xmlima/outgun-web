// SPDX-License-Identifier: GPL-2.0-or-later
// Rede simulada para testes e para a opção de depuração do cliente: atraso fixo, jitter e perda
// como acontece num WebSocket (TCP): o pacote perdido é retransmitido um RTT depois e segura os
// que vêm atrás dele (entrega em ordem). Determinística com a semente.

export interface LinkConditions {
  /** Atraso de ida e volta (ms); cada sentido leva metade. */
  rttMs: number;
  /** Variação aleatória extra de cada pacote, 0..jitterMs (ms). */
  jitterMs: number;
  /** Probabilidade de perda de um pacote (0..1). */
  loss: number;
}

/** Gerador congruencial simples (a rede simulada não faz parte da simulação do jogo). */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Um sentido da conexão: entrega os pacotes em ordem, cada um no seu horário. */
export class SimulatedLink<T> {
  private readonly queue: { at: number; data: T }[] = [];
  private lastAt = 0;
  private readonly random: () => number;
  /** Pacotes perdidos e retransmitidos. */
  lost = 0;

  constructor(
    public conditions: LinkConditions,
    seed = 1,
  ) {
    this.random = lcg(seed);
  }

  send(data: T, now: number): void {
    const c = this.conditions;
    let at = now + c.rttMs / 2 + this.random() * c.jitterMs;
    if (this.random() < c.loss) {
      this.lost++;
      at += Math.max(c.rttMs, 20) + 10; // retransmissão depois de um RTT
    }
    at = Math.max(at, this.lastAt); // TCP: ninguém passa à frente do retransmitido
    this.lastAt = at;
    this.queue.push({ at, data });
  }

  /** Pacotes que chegaram até `now`, em ordem. */
  receive(now: number): T[] {
    let n = 0;
    while (n < this.queue.length && (this.queue[n] as { at: number }).at <= now) n++;
    return this.queue.splice(0, n).map((p) => p.data);
  }

  /** Quando chega o próximo pacote (ou Infinity). */
  nextArrival(): number {
    return this.queue[0]?.at ?? Infinity;
  }
}
