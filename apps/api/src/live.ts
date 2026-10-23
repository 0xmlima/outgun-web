// SPDX-License-Identifier: GPL-2.0-or-later
// Portal ao vivo (OG-284): avisos do que mudou, para as telas abertas relerem na hora em vez de
// esperar a próxima consulta periódica. Só o tópico vai (nada de dado): `rooms` (heartbeat com
// salas diferentes), `matches` (partida gravada: ranking, perfis, últimas partidas) e
// `notifications` (só para a conta avisada). Um processo de API só (o beta é uma VM): o barramento
// fica na memória. Avisos do mesmo tópico em 250 ms viram um (a transação já terminou até lá).
export type LiveTopic = 'rooms' | 'matches' | 'notifications';

type Listener = (topic: LiveTopic) => void;

const DEBOUNCE_MS = 250;

export class LiveBus {
  private readonly listeners = new Map<Listener, string | null>();
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

  /** Inscreve uma conexão; `userId` recebe também as notificações dela. Devolve o cancelamento. */
  subscribe(listener: Listener, userId: string | null): () => void {
    this.listeners.set(listener, userId);
    return () => void this.listeners.delete(listener);
  }

  get size(): number {
    return this.listeners.size;
  }

  /** Tópico público para todos, ou `notifications` para as contas listadas. */
  publish(topic: LiveTopic, userIds?: readonly string[]): void {
    const targets = topic === 'notifications' ? (userIds ?? []) : [null];
    for (const user of targets) {
      const key = `${topic}:${user ?? '*'}`;
      if (this.pending.has(key)) continue;
      this.pending.set(
        key,
        setTimeout(() => {
          this.pending.delete(key);
          for (const [listener, owner] of this.listeners) if (user === null || owner === user) listener(topic);
        }, DEBOUNCE_MS),
      );
    }
  }

  close(): void {
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
    this.listeners.clear();
  }
}

/** O barramento do processo (as rotas e o `notify` publicam aqui). */
export const liveBus = new LiveBus();
