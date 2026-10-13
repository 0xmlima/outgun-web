// SPDX-License-Identifier: GPL-2.0-or-later
// Transporte: WebSocket (uWebSockets.js, D-03) em /rooms/:id, healthcheck, métricas e uma página
// de depuração. A primeira mensagem do cliente tem de ser `hello` com o ticket da API (OG-083); com
// `devTickets`, `dev:Nome` entra como convidado.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeFrame, encodeFrame, message, PROTOCOL_VERSION, type MessageOf } from '@outgun/protocol';
import uWS from 'uWebSockets.js';
import type { KeyObject } from 'node:crypto';
import type { RoomManager } from './rooms.js';
import { TicketAuth } from './tickets.js';

export interface ServerOptions {
  port: number;
  host?: string;
  manager: RoomManager;
  /** Aceita tickets `dev:Nome` (desenvolvimento e testes). */
  devTickets: boolean;
  /** Atrás de proxy: o IP do jogador vem do primeiro endereço de X-Forwarded-For. */
  trustProxy?: boolean;
  /** Chaves públicas dos tickets da API (JWKS); sem elas, só tickets `dev:`. */
  ticketKeys?: () => ReadonlyMap<string, KeyObject>;
  /** Pasta com `index.js` etc. de @outgun/protocol, servida em /protocol/ para a página de depuração. */
  protocolDist?: string;
  devPage?: string;
}

interface SocketData {
  roomId: string;
  pid: number;
  ip: string;
}

export interface RunningServer {
  port: number;
  close(): void;
}

export function startServer(options: ServerOptions): Promise<RunningServer> {
  const { manager } = options;
  const tickets = new TicketAuth({ devTickets: options.devTickets, ...(options.ticketKeys ? { keys: options.ticketKeys } : {}) });
  const app = uWS.App();
  const reject = (ws: uWS.WebSocket<SocketData>, reason: MessageOf<'reject'>['reason'], text: string) => {
    ws.send(encodeFrame(message('reject', { reason, text })), true);
    ws.end(4000, reason);
  };

  app.ws<SocketData>('/rooms/:id', {
    compression: uWS.DISABLED,
    maxPayloadLength: 64 * 1024,
    idleTimeout: 60,
    upgrade: (res, req, context) => {
      const roomId = req.getParameter(0) ?? '';
      if (!manager.get(roomId)) {
        res.writeStatus('404 Not Found').end('sala inexistente');
        return;
      }
      const forwarded = options.trustProxy ? req.getHeader('x-forwarded-for').split(',')[0]?.trim() : '';
      const ip = forwarded || Buffer.from(res.getRemoteAddressAsText()).toString();
      res.upgrade<SocketData>(
        { roomId, pid: -1, ip },
        req.getHeader('sec-websocket-key'),
        req.getHeader('sec-websocket-protocol'),
        req.getHeader('sec-websocket-extensions'),
        context,
      );
    },
    message: (ws, data, isBinary) => {
      const user = ws.getUserData();
      const room = manager.get(user.roomId);
      if (!room) return ws.end(1001, 'sala encerrada');
      if (!isBinary) return ws.end(1003, 'só mensagens binárias');
      // o ArrayBuffer do uWS só vale durante o callback: decodifica na hora
      const decoded = decodeFrame(new Uint8Array(data.slice(0)), 'c2s');
      if (!decoded.ok) {
        // depois de entrar, erro de formato é `client_misbehavior`, como no original
        if (user.pid === -1) return ws.end(4002, 'mensagem inválida');
        room.misbehaved(user.pid, decoded.error);
        return;
      }
      if (user.pid === -1) {
        const [hello, ...rest] = decoded.messages;
        if (hello?.type !== 'hello') return ws.end(4002, 'esperava hello');
        if (hello.protocol !== PROTOCOL_VERSION) return reject(ws, 'protocolMismatch', `protocolo ${PROTOCOL_VERSION} exigido`);
        const auth = tickets.identify(hello.ticket, user.roomId);
        if (!auth.ok) return reject(ws, 'invalidTicket', `ticket inválido (${auth.reason})`);
        const identity = { ...auth.identity, ip: user.ip };
        const joined = room.join(
          {
            send: (b) => void ws.send(b, true),
            close: (code, reason) => ws.end(code, reason),
            // troca de time muda o pid do jogador
            moved: (pid) => {
              user.pid = pid;
            },
          },
          identity,
        );
        if (!joined.ok) return reject(ws, joined.reason, joined.text);
        user.pid = joined.pid;
        if (rest.length > 0) room.handle(user.pid, rest);
        return;
      }
      room.handle(user.pid, decoded.messages);
    },
    close: (ws) => {
      const user = ws.getUserData();
      if (user.pid !== -1) manager.get(user.roomId)?.leave(user.pid);
      user.pid = -1;
    },
  });

  app.get('/health', (res) => {
    res.writeHeader('content-type', 'application/json').end(JSON.stringify({ status: 'ok', ...manager.metrics() }));
  });

  app.get('/metrics', (res) => {
    const m = manager.metrics();
    const lines = [
      ['outgun_rooms', m.rooms],
      ['outgun_players', m.players],
      ['outgun_ticks_total', m.ticks],
      ['outgun_ticks_skipped_total', m.skippedTicks],
      ['outgun_tick_lateness_p50_ms', m.latenessP50],
      ['outgun_tick_lateness_p99_ms', m.latenessP99],
      ['outgun_tick_lateness_max_ms', m.latenessMax],
      ['outgun_tick_cost_p99_ms', m.tickCostP99],
      ['outgun_client_bytes_per_second_avg', m.clientBytesPerSecond],
    ];
    res.writeHeader('content-type', 'text/plain; version=0.0.4').end(lines.map(([k, v]) => `${k} ${v}`).join('\n') + '\n');
  });

  app.get('/rooms', (res) => {
    const rooms = manager.list().map((r) => ({ id: r.id, mode: r.mode, players: r.playerCount, maxPlayers: r.world.maxPlayers, map: r.world.map.title }));
    res.writeHeader('content-type', 'application/json').end(JSON.stringify(rooms));
  });

  if (options.devPage) {
    const page = options.devPage;
    app.get('/dev', (res) => {
      res.writeHeader('content-type', 'text/html; charset=utf-8').end(readFileSync(page));
    });
  }
  if (options.protocolDist) {
    const dist = options.protocolDist;
    app.get('/protocol/:file', (res, req) => {
      const file = req.getParameter(0) ?? '';
      if (!/^[a-z]+\.js$/.test(file)) return void res.writeStatus('404 Not Found').end();
      try {
        res.writeHeader('content-type', 'text/javascript').end(readFileSync(join(dist, file)));
      } catch {
        res.writeStatus('404 Not Found').end();
      }
    });
  }

  return new Promise((resolve, reject) => {
    app.listen(options.host ?? '0.0.0.0', options.port, (socket) => {
      if (!socket) return reject(new Error(`não consegui escutar na porta ${options.port}`));
      resolve({ port: uWS.us_socket_local_port(socket), close: () => uWS.us_listen_socket_close(socket) });
    });
  });
}
