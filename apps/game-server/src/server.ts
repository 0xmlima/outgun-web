// SPDX-License-Identifier: GPL-2.0-or-later
// Transporte: WebSocket (uWebSockets.js, D-03) em /rooms/:id, healthcheck, métricas e uma página
// de depuração. A primeira mensagem do cliente tem de ser `hello` com o ticket da API (OG-083); com
// `devTickets`, `dev:Nome` entra como convidado.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeFrame, encodeFrame, message, PROTOCOL_VERSION, type MessageOf } from '@outgun/protocol';
import uWS from 'uWebSockets.js';
import type { KeyObject } from 'node:crypto';
import type { RoomSpawn } from '@outgun/tickets';
import type { Connection, Room } from './room.js';
import type { RoomManager } from './rooms.js';
import type { ReplayStore } from './replay.js';
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
  /**
   * Abre a sala pedida no ticket (claim `spawn`, OG-086) quando ela não existe aqui; devolve
   * undefined se não puder (sem vaga, mapas inválidos). Sem esta opção, só salas já criadas.
   */
  spawnRoom?: (id: string, spec: RoomSpawn) => Room | undefined;
  /** Replays gravados (OG-090), servidos em /replays/<chave>.ogr. */
  replays?: ReplayStore;
}

const ROOM_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

interface SocketData {
  roomId: string;
  pid: number;
  ip: string;
  /** Conexão entregue à sala (para a sala saber se a queda é da conexão atual do jogador). */
  conn: Connection | null;
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
      if (!manager.get(roomId) && !(options.spawnRoom && ROOM_ID.test(roomId))) {
        res.writeStatus('404 Not Found').end('sala inexistente');
        return;
      }
      const forwarded = options.trustProxy ? req.getHeader('x-forwarded-for').split(',')[0]?.trim() : '';
      const ip = forwarded || Buffer.from(res.getRemoteAddressAsText()).toString();
      res.upgrade<SocketData>(
        { roomId, pid: -1, ip, conn: null },
        req.getHeader('sec-websocket-key'),
        req.getHeader('sec-websocket-protocol'),
        req.getHeader('sec-websocket-extensions'),
        context,
      );
    },
    message: (ws, data, isBinary) => {
      const user = ws.getUserData();
      let room = manager.get(user.roomId);
      // antes do hello a sala pode não existir ainda: o ticket pode pedir a abertura
      if (!room && user.pid !== -1) return ws.end(1001, 'sala encerrada');
      if (!isBinary) return ws.end(1003, 'só mensagens binárias');
      // o ArrayBuffer do uWS só vale durante o callback: decodifica na hora
      const decoded = decodeFrame(new Uint8Array(data.slice(0)), 'c2s');
      if (!decoded.ok) {
        // depois de entrar, erro de formato é `client_misbehavior`, como no original
        if (user.pid === -1) return ws.end(4002, 'mensagem inválida');
        room?.misbehaved(user.pid, decoded.error);
        return;
      }
      if (user.pid === -1) {
        const [hello, ...rest] = decoded.messages;
        if (hello?.type !== 'hello') return ws.end(4002, 'esperava hello');
        if (hello.protocol !== PROTOCOL_VERSION) return reject(ws, 'protocolMismatch', `protocolo ${PROTOCOL_VERSION} exigido`);
        const auth = tickets.identify(hello.ticket, user.roomId);
        if (!auth.ok) return reject(ws, 'invalidTicket', `ticket inválido (${auth.reason})`);
        room ??= auth.spawn && options.spawnRoom ? options.spawnRoom(user.roomId, auth.spawn) : undefined;
        if (!room) return reject(ws, 'roomClosed', 'sala indisponível neste servidor');
        const identity = { ...auth.identity, ip: user.ip };
        const conn: Connection = {
          send: (b) => void ws.send(b, true),
          close: (code, reason) => ws.end(code, reason),
          // troca de time muda o pid do jogador
          moved: (pid) => {
            user.pid = pid;
          },
        };
        // `resume` junto do hello: volta à vaga guardada depois de uma queda (OG-047)
        const resume = rest.find((m) => m.type === 'resume');
        const others = rest.filter((m) => m.type !== 'resume');
        const joined = (resume?.type === 'resume' ? room.resume(conn, identity, resume.token) : null) ?? room.join(conn, identity);
        if (!joined.ok) return reject(ws, joined.reason, joined.text);
        user.pid = joined.pid;
        user.conn = conn;
        if (others.length > 0) room.handle(user.pid, others);
        return;
      }
      room!.handle(user.pid, decoded.messages);
    },
    close: (ws) => {
      const user = ws.getUserData();
      if (user.pid !== -1 && user.conn) manager.get(user.roomId)?.disconnect(user.pid, user.conn);
      user.pid = -1;
    },
  });

  // Espectadores ao vivo (OG-092): sem ticket, só recebem; o atraso é o `spectating_delay` da sala.
  app.ws<{ roomId: string; conn: Connection | null }>('/rooms/:id/spectate', {
    compression: uWS.DISABLED,
    maxPayloadLength: 1024,
    idleTimeout: 120,
    upgrade: (res, req, context) => {
      const roomId = req.getParameter(0) ?? '';
      if (!manager.get(roomId)) {
        res.writeStatus('404 Not Found').end('sala inexistente');
        return;
      }
      res.upgrade({ roomId, conn: null }, req.getHeader('sec-websocket-key'), req.getHeader('sec-websocket-protocol'), req.getHeader('sec-websocket-extensions'), context);
    },
    open: (ws) => {
      const user = ws.getUserData();
      const room = manager.get(user.roomId);
      const conn: Connection = { send: (b) => void ws.send(b, true), close: (code, reason) => ws.end(code, reason) };
      if (!room) return ws.end(1001, 'sala encerrada');
      if (!room.addSpectator(conn)) {
        ws.send(encodeFrame(message('reject', { reason: 'serverFull', text: 'Limite de espectadores da sala.' })), true);
        return ws.end(4000, 'serverFull');
      }
      user.conn = conn;
    },
    message: () => {},
    close: (ws) => {
      const user = ws.getUserData();
      if (user.conn) manager.get(user.roomId)?.removeSpectator(user.conn);
      user.conn = null;
    },
  });

  app.get('/health', (res) => {
    // o lobby mede o ping de cada região com este endereço (OG-069)
    res.writeHeader('access-control-allow-origin', '*').writeHeader('cache-control', 'no-store').writeHeader('content-type', 'application/json').end(JSON.stringify({ status: 'ok', ...manager.metrics() }));
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

  if (options.replays) {
    const store = options.replays;
    app.get('/replays/:file', (res, req) => {
      const file = store.path(req.getParameter(0) ?? '');
      let data: Buffer;
      try {
        if (!file) throw new Error('nome inválido');
        data = readFileSync(file);
      } catch {
        return void res.writeStatus('404 Not Found').writeHeader('access-control-allow-origin', '*').end();
      }
      res.writeHeader('access-control-allow-origin', '*').writeHeader('content-type', 'application/octet-stream').writeHeader('cache-control', 'public, max-age=31536000, immutable').end(data);
    });
  }

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
