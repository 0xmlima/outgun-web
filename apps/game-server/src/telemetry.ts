// SPDX-License-Identifier: GPL-2.0-or-later
// Métricas do game server (OG-102), expostas em /metrics para o Prometheus. Tempos em segundos,
// como manda a convenção do Prometheus; o painel e o alerta ficam em tools/observability/.
import { DURATION_BUCKETS, Registry, registerProcessMetrics, type ErrorReporter, type Logger } from '@outgun/observability';
import type { RoomCloseReason, RoomManager, TickObserver } from './rooms.js';

export type ConnectionKind = 'player' | 'spectator';

export class GameTelemetry implements TickObserver {
  readonly registry = new Registry();
  readonly tickDuration = this.registry.histogram('outgun_tick_duration_seconds', 'Duração de um tick de todas as salas do processo (simulação + serialização).', DURATION_BUCKETS);
  readonly roomTickDuration = this.registry.histogram('outgun_room_tick_duration_seconds', 'Duração do tick de uma sala.', DURATION_BUCKETS);
  readonly tickLateness = this.registry.histogram('outgun_tick_lateness_seconds', 'Atraso do início do tick em relação ao horário ideal (10 Hz).', DURATION_BUCKETS);
  readonly inputWait = this.registry.histogram('outgun_input_tick_wait_seconds', 'Espera de uma mudança de controles entre a chegada e o tick que a aplica (OG-369).', DURATION_BUCKETS);
  readonly inputOverwritten = this.registry.counter('outgun_input_overwritten_total', 'Mudanças de controles sobrescritas por outra antes do tick (nunca aplicadas sozinhas).');
  readonly bytesSent = this.registry.counter('outgun_ws_sent_bytes_total', 'Bytes enviados pelos WebSockets (jogadores e espectadores).');
  readonly bytesReceived = this.registry.counter('outgun_ws_received_bytes_total', 'Bytes recebidos dos WebSockets.');
  readonly connections = this.registry.counter('outgun_ws_connections_total', 'Conexões por tipo e resultado (accepted, ou o motivo da recusa).');
  readonly errors = this.registry.counter('outgun_errors_total', 'Erros por tipo: tick (exceção numa sala), misbehavior (cliente expulso), platform (falha ao falar com a API).');
  readonly wsClosed = this.registry.counter('outgun_ws_closed_total', 'WebSockets fechados por tipo e código (1000 saída, 1001 sala encerrada, 1006 queda sem aviso, 4xxx do jogo, other) (OG-454).');
  readonly roomsClosed = this.registry.counter('outgun_rooms_closed_total', 'Salas encerradas por motivo: finished, empty, shutdown (OG-454).');
  private open = { player: 0, spectator: 0 };

  constructor(
    manager: RoomManager,
    private readonly log?: Logger,
    private readonly reporter?: ErrorReporter,
  ) {
    const r = this.registry;
    r.gauge('outgun_rooms', 'Salas abertas por modo.', () => byMode(manager, () => 1));
    r.gauge('outgun_players', 'Jogadores humanos conectados por modo.', () => byMode(manager, (room) => room.playerCount - room.botClients().length));
    r.gauge('outgun_bots', 'Bots nas salas.', () => manager.list().reduce((n, room) => n + room.botClients().length, 0));
    r.gauge('outgun_spectators', 'Espectadores ao vivo.', () => manager.list().reduce((n, room) => n + room.spectatorCount, 0));
    r.gauge('outgun_ws_open_connections', 'WebSockets abertos por tipo.', () => [
      [{ kind: 'player' }, this.open.player],
      [{ kind: 'spectator' }, this.open.spectator],
    ]);
    r.gauge('outgun_client_bytes_per_second_avg', 'Tráfego médio enviado a cada jogador desde que entrou (bytes/s).', () => manager.metrics().clientBytesPerSecond);
    r.counterFrom('outgun_ticks_total', 'Ticks executados.', () => manager.loop.stats.ticks);
    r.counterFrom('outgun_ticks_skipped_total', 'Ticks descartados por atraso.', () => manager.loop.stats.skipped);
    if (reporter) {
      r.counterFrom('outgun_error_reports_total', 'Erros enviados ao serviço de erros, por resultado.', () => [
        [{ result: 'sent' }, reporter.counts.sent],
        [{ result: 'dropped' }, reporter.counts.dropped],
        [{ result: 'failed' }, reporter.counts.failed],
      ]);
    }
    registerProcessMetrics(r);
  }

  tick(durationMs: number, latenessMs: number): void {
    this.tickDuration.observe(durationMs / 1000);
    this.tickLateness.observe(Math.max(0, latenessMs) / 1000);
  }

  input(waitsMs: readonly number[], overwritten: number): void {
    for (const ms of waitsMs) this.inputWait.observe(ms / 1000);
    if (overwritten) this.inputOverwritten.inc(overwritten);
  }

  roomTick(durationMs: number): void {
    this.roomTickDuration.observe(durationMs / 1000);
  }

  roomError(roomId: string, error: unknown): void {
    this.errors.inc(1, { kind: 'tick' });
    this.log?.error({ room: roomId, err: error }, 'exceção no tick da sala');
    this.reporter?.capture(error, { tags: { room: roomId, where: 'tick' } });
  }

  opened(kind: ConnectionKind): void {
    this.open[kind]++;
    this.connections.inc(1, { kind, result: 'accepted' });
  }

  closed(kind: ConnectionKind, code: number): void {
    this.open[kind] = Math.max(0, this.open[kind] - 1);
    this.wsClosed.inc(1, { kind, code: closeCode(code) });
  }

  roomClosed(roomId: string, reason: RoomCloseReason): void {
    this.roomsClosed.inc(1, { reason });
    this.log?.info({ room: roomId, reason }, 'sala encerrada');
  }

  rejected(kind: ConnectionKind, reason: string): void {
    this.connections.inc(1, { kind, result: reason });
  }

  render(): string {
    return this.registry.render();
  }
}

/** Códigos de fechamento com rótulo próprio; o resto vira `other` (cardinalidade fixa). */
const CLOSE_CODES = new Set([1000, 1001, 1003, 1005, 1006, 1011, 4000, 4001, 4002, 4003]);

export function closeCode(code: number): string {
  return CLOSE_CODES.has(code) ? String(code) : 'other';
}

function byMode(manager: RoomManager, count: (room: ReturnType<RoomManager['list']>[number]) => number): [{ mode: string }, number][] {
  const totals = { casual: 0, ranked: 0 };
  for (const room of manager.list()) totals[room.mode] += count(room);
  return [
    [{ mode: 'casual' }, totals.casual],
    [{ mode: 'ranked' }, totals.ranked],
  ];
}
