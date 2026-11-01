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
import { metricsAuthorized, PROMETHEUS_CONTENT_TYPE, type Logger } from '@outgun/observability';
import { GameTelemetry } from './telemetry.js';
import type { GeneratedMaps } from './generated-maps.js';

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
  /** Mapas gerados da rotação (OG-015), servidos em /maps/mapgen_<n>.txt para o cliente baixar. */
  generatedMaps?: GeneratedMaps;
  /** Mapas da moderação (OG-367), servidos em /maps/<nome>.txt em Latin-1. */
  panelMaps?: { text(name: string): string | undefined };
  /** Métricas (OG-102); sem elas, o servidor cria as suas. */
  telemetry?: GameTelemetry;
  /** Exige `Authorization: Bearer <token>` em /metrics. */
  metricsToken?: string;
  /**
   * Id desta instância (no Fly, FLY_MACHINE_ID; OG-103). As salas também respondem em
   * `/m/<id>/rooms/...`: o endereço anunciado à API leva o id da máquina, e um pedido que o proxy
   * entregar a outra máquina recebe `fly-replay` para ser reenviado à certa.
   */
  instanceId?: string;
  /** Conexões abertas ao mesmo tempo por IP, jogadores e espectadores (OG-104; padrão 8, 0 = sem limite). */
  maxConnectionsPerIp?: number;
  /**
   * Origens aceitas no upgrade do WebSocket (OG-311, OWASP WebSocket Security): pedido de navegador
   * vindo de outro site é recusado. Vazio = qualquer origem (desenvolvimento). Sem `Origin` (clientes
   * fora do navegador: bots, carga) continua aceito; o ticket assinado é que autentica.
   */
  allowedOrigins?: readonly string[];
  /** Log estruturado das entradas e recusas (com o `jti` do ticket para correlacionar com a API). */
  logger?: Logger;
}

const ROOM_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

interface SocketData {
  roomId: string;
  pid: number;
  ip: string;
  /** Conexão entregue à sala (para a sala saber se a queda é da conexão atual do jogador). */
  conn: Connection | null;
  /** Momento do último ping de WebSocket ainda sem pong (0 = nenhum) e quando foi enviado o último. */
  pingSent: number;
  lastPing: number;
  /** Ping suavizado (ms). */
  rtt: number | undefined;
}

export interface RunningServer {
  port: number;
  close(): void;
}

export function startServer(options: ServerOptions): Promise<RunningServer> {
  const { manager } = options;
  const tickets = new TicketAuth({ devTickets: options.devTickets, ...(options.ticketKeys ? { keys: options.ticketKeys } : {}) });
  const telemetry = options.telemetry ?? new GameTelemetry(manager);
  manager.observer ??= telemetry;
  const log = options.logger;
  const app = uWS.App();
  // conexões por IP (OG-104): um endereço não ocupa as vagas de uma sala nem enche o processo
  const perIp = new Map<string, number>();
  const maxPerIp = options.maxConnectionsPerIp ?? 8;
  const ipFull = (ip: string) => maxPerIp > 0 && (perIp.get(ip) ?? 0) >= maxPerIp;
  const ipOpened = (ip: string) => perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
  const ipClosed = (ip: string) => {
    const n = (perIp.get(ip) ?? 1) - 1;
    if (n > 0) perIp.set(ip, n);
    else perIp.delete(ip);
  };
  const origins = new Set((options.allowedOrigins ?? []).map((o) => o.replace(/\/+$/, '').toLowerCase()));
  /** Origem de navegador fora da lista: responde 403 e devolve true. */
  const badOrigin = (res: uWS.HttpResponse, req: uWS.HttpRequest, kind: 'player' | 'spectator'): boolean => {
    const origin = req.getHeader('origin').toLowerCase();
    if (!origin || origins.size === 0 || origins.has(origin)) return false;
    telemetry.rejected(kind, 'badOrigin');
    res.writeStatus('403 Forbidden').end('origem não permitida');
    return true;
  };
  const clientIp = (res: uWS.HttpResponse, req: uWS.HttpRequest) => {
    const forwarded = options.trustProxy ? req.getHeader('x-forwarded-for').split(',')[0]?.trim() : '';
    return forwarded || Buffer.from(res.getRemoteAddressAsText()).toString();
  };
  /** Segmento depois de `name` no caminho (`/m/x/rooms/<id>/spectate` → id), com ou sem o prefixo da instância. */
  const segment = (req: uWS.HttpRequest, name: string) => {
    const parts = req.getUrl().split('/');
    const i = parts.indexOf(name, 1);
    return i === -1 ? '' : (parts[i + 1] ?? '');
  };
  /** Pedido em `/m/<outra>/...`: manda o proxy da plataforma reenviar para a instância certa. */
  const elsewhere = (res: uWS.HttpResponse, req: uWS.HttpRequest): boolean => {
    const parts = req.getUrl().split('/');
    if (parts[1] !== 'm' || !options.instanceId) return false;
    const target = parts[2] ?? '';
    if (target === options.instanceId) return false;
    if (!/^[a-z0-9]{1,32}$/.test(target)) res.writeStatus('404 Not Found').end();
    else res.writeStatus('409 Conflict').writeHeader('fly-replay', `instance=${target}`).end();
    return true;
  };
  const send = (ws: uWS.WebSocket<unknown>, data: Uint8Array) => {
    telemetry.bytesSent.inc(data.length);
    ws.send(data, true);
  };
  const reject = (ws: uWS.WebSocket<SocketData>, reason: MessageOf<'reject'>['reason'], text: string) => {
    telemetry.rejected('player', reason);
    log?.info({ room: ws.getUserData().roomId, ip: ws.getUserData().ip, reason }, 'entrada recusada');
    send(ws, encodeFrame(message('reject', { reason, text })));
    ws.end(4000, reason);
  };

  const playerSocket: uWS.WebSocketBehavior<SocketData> = {
    compression: uWS.DISABLED,
    maxPayloadLength: 64 * 1024,
    idleTimeout: 60,
    upgrade: (res, req, context) => {
      if (elsewhere(res, req)) return;
      const roomId = segment(req, 'rooms');
      if (!manager.get(roomId) && !(options.spawnRoom && ROOM_ID.test(roomId))) {
        res.writeStatus('404 Not Found').end('sala inexistente');
        return;
      }
      if (badOrigin(res, req, 'player')) return;
      const ip = clientIp(res, req);
      if (ipFull(ip)) {
        telemetry.rejected('player', 'tooManyConnections');
        res.writeStatus('429 Too Many Requests').end('conexões demais deste endereço');
        return;
      }
      res.upgrade<SocketData>(
        { roomId, pid: -1, ip, conn: null, pingSent: 0, lastPing: 0, rtt: undefined },
        req.getHeader('sec-websocket-key'),
        req.getHeader('sec-websocket-protocol'),
        req.getHeader('sec-websocket-extensions'),
        context,
      );
    },
    open: (ws) => {
      ipOpened(ws.getUserData().ip);
    },
    message: (ws, data, isBinary) => {
      telemetry.bytesReceived.inc(data.byteLength);
      const user = ws.getUserData();
      // ping: frame de controle do WebSocket (o navegador responde sozinho), no máximo um a cada 2 s
      const now = performance.now();
      if (user.pid !== -1 && now - user.lastPing >= 2000) {
        user.lastPing = now;
        user.pingSent = now;
        ws.ping();
      }
      let room = manager.get(user.roomId);
      // antes do hello a sala pode não existir ainda: o ticket pode pedir a abertura
      if (!room && user.pid !== -1) return ws.end(1001, 'sala encerrada');
      if (!isBinary) return ws.end(1003, 'só mensagens binárias');
      // o ArrayBuffer do uWS só vale durante o callback: decodifica na hora
      const decoded = decodeFrame(new Uint8Array(data.slice(0)), 'c2s');
      if (!decoded.ok) {
        // depois de entrar, erro de formato é `client_misbehavior`, como no original
        if (user.pid === -1) {
          telemetry.rejected('player', 'malformed');
          return ws.end(4002, 'mensagem inválida');
        }
        room?.misbehaved(user.pid, decoded.error);
        return;
      }
      if (user.pid === -1) {
        const [hello, ...rest] = decoded.messages;
        if (hello?.type !== 'hello') {
          telemetry.rejected('player', 'malformed');
          return ws.end(4002, 'esperava hello');
        }
        if (hello.protocol !== PROTOCOL_VERSION) return reject(ws, 'protocolMismatch', `protocolo ${PROTOCOL_VERSION} exigido`);
        const auth = tickets.identify(hello.ticket, user.roomId);
        if (!auth.ok) return reject(ws, 'invalidTicket', `ticket inválido (${auth.reason})`);
        room ??= auth.spawn && options.spawnRoom ? options.spawnRoom(user.roomId, auth.spawn) : undefined;
        if (!room) return reject(ws, 'roomClosed', 'sala indisponível neste servidor');
        const identity = { ...auth.identity, ip: user.ip };
        const conn: Connection = {
          send: (b) => send(ws, b),
          close: (code, reason) => ws.end(code, reason),
          // troca de time muda o pid do jogador
          moved: (pid) => {
            user.pid = pid;
          },
          rtt: () => user.rtt,
        };
        // `resume` junto do hello: volta à vaga guardada depois de uma queda (OG-047). Sem o token (outra aba
        // ou navegador), quem tem conta volta pela conta à vaga dele ou à do bot substituto (OG-261/262)
        const resume = rest.find((m) => m.type === 'resume');
        const others = rest.filter((m) => m.type !== 'resume');
        const token = resume?.type === 'resume' ? resume.token : '';
        const joined = (token !== '' || identity.accountId !== null ? room.resume(conn, identity, token) : null) ?? room.join(conn, identity);
        if (!joined.ok) return reject(ws, joined.reason, joined.text);
        user.pid = joined.pid;
        user.conn = conn;
        telemetry.opened('player');
        log?.info({ room: user.roomId, pid: joined.pid, jti: auth.jti, account: identity.accountId, ip: user.ip }, 'jogador entrou');
        if (others.length > 0) room.handle(user.pid, others);
        return;
      }
      room!.handle(user.pid, decoded.messages);
    },
    pong: (ws) => {
      const user = ws.getUserData();
      if (user.pingSent === 0) return; // pong de um ping automático do uWS
      const ms = performance.now() - user.pingSent;
      user.pingSent = 0;
      user.rtt = user.rtt === undefined ? ms : user.rtt * 0.7 + ms * 0.3;
    },
    close: (ws, code) => {
      const user = ws.getUserData();
      ipClosed(user.ip);
      if (user.pid !== -1 && user.conn) {
        telemetry.closed('player', code);
        // 1000 = o cliente fechou pelo "Sair" (`connection.close`); queda de rede vem com outro código
        manager.get(user.roomId)?.disconnect(user.pid, user.conn, code === 1000);
      }
      user.pid = -1;
    },
  };
  for (const path of ['/rooms/:id', '/m/:machine/rooms/:id']) app.ws<SocketData>(path, playerSocket);

  // Espectadores ao vivo (OG-092): sem ticket, só recebem; o atraso é o `spectating_delay` da sala.
  const spectatorSocket: uWS.WebSocketBehavior<{ roomId: string; ip: string; conn: Connection | null; room: Room | null }> = {
    compression: uWS.DISABLED,
    maxPayloadLength: 1024,
    idleTimeout: 120,
    upgrade: (res, req, context) => {
      if (elsewhere(res, req)) return;
      const roomId = segment(req, 'rooms');
      if (!manager.get(roomId)) {
        res.writeStatus('404 Not Found').end('sala inexistente');
        return;
      }
      if (badOrigin(res, req, 'spectator')) return;
      const ip = clientIp(res, req);
      if (ipFull(ip)) {
        telemetry.rejected('spectator', 'tooManyConnections');
        res.writeStatus('429 Too Many Requests').end('conexões demais deste endereço');
        return;
      }
      res.upgrade({ roomId, ip, conn: null, room: null }, req.getHeader('sec-websocket-key'), req.getHeader('sec-websocket-protocol'), req.getHeader('sec-websocket-extensions'), context);
    },
    open: (ws) => {
      const user = ws.getUserData();
      ipOpened(user.ip);
      const room = manager.get(user.roomId);
      const conn: Connection = { send: (b) => send(ws, b), close: (code, reason) => ws.end(code, reason) };
      if (!room) return ws.end(1001, 'sala encerrada');
      if (!room.addSpectator(conn)) {
        telemetry.rejected('spectator', 'serverFull');
        send(ws, encodeFrame(message('reject', { reason: 'serverFull', text: 'Limite de espectadores da sala.' })));
        return ws.end(4000, 'serverFull');
      }
      user.conn = conn;
      user.room = room; // a sala encerrada sai do manager mas segue mandando o atraso (OG-533)
      telemetry.opened('spectator');
    },
    message: () => {},
    close: (ws, code) => {
      const user = ws.getUserData();
      ipClosed(user.ip);
      if (user.conn) {
        telemetry.closed('spectator', code);
        user.room?.removeSpectator(user.conn);
      }
      user.conn = null;
      user.room = null;
    },
  };
  for (const path of ['/rooms/:id/spectate', '/m/:machine/rooms/:id/spectate']) app.ws(path, spectatorSocket);

  app.get('/health', (res) => {
    // o lobby mede o ping de cada região com este endereço (OG-069)
    res.writeHeader('access-control-allow-origin', '*').writeHeader('cache-control', 'no-store').writeHeader('content-type', 'application/json').end(JSON.stringify({ status: 'ok', ...manager.metrics() }));
  });

  app.get('/metrics', (res, req) => {
    if (!metricsAuthorized(options.metricsToken, req.getHeader('authorization') || undefined)) return void res.writeStatus('401 Unauthorized').end();
    res.writeHeader('content-type', PROMETHEUS_CONTENT_TYPE).writeHeader('cache-control', 'no-store').end(telemetry.render());
  });

  app.get('/rooms', (res) => {
    const rooms = manager.list().map((r) => ({ id: r.id, mode: r.mode, players: r.playerCount, maxPlayers: r.world.maxPlayers, map: r.world.map.title }));
    res.writeHeader('content-type', 'application/json').end(JSON.stringify(rooms));
  });

  if (options.generatedMaps || options.panelMaps) {
    const { generatedMaps: generated, panelMaps } = options;
    const mapText = (res: uWS.HttpResponse, req: uWS.HttpRequest) => {
      if (elsewhere(res, req)) return;
      let file = '';
      try {
        file = decodeURIComponent(segment(req, 'maps'));
      } catch {
        // nome mal codificado: 404
      }
      const m = /^(.+)\.txt$/.exec(file);
      const name = m?.[1] ?? '';
      // gerado (OG-015) ou da moderação (OG-367); o da moderação vai em Latin-1 e pode mudar de versão
      const generatedText = /^mapgen_\d+$/.test(name) ? generated?.text(name) : undefined;
      const panelText = generatedText === undefined && name ? panelMaps?.text(name) : undefined;
      if (generatedText === undefined && panelText === undefined) return void res.writeStatus('404 Not Found').writeHeader('access-control-allow-origin', '*').end();
      res.writeHeader('access-control-allow-origin', '*');
      if (generatedText !== undefined) res.writeHeader('content-type', 'text/plain; charset=utf-8').writeHeader('cache-control', 'public, max-age=3600').end(generatedText);
      else res.writeHeader('content-type', 'text/plain; charset=iso-8859-1').writeHeader('cache-control', 'no-cache').end(Buffer.from(panelText!, 'latin1'));
    };
    app.get('/maps/:file', mapText);
    app.get('/m/:machine/maps/:file', mapText);
  }

  if (options.replays) {
    const store = options.replays;
    const replay = (res: uWS.HttpResponse, req: uWS.HttpRequest) => {
      if (elsewhere(res, req)) return;
      const file = store.path(segment(req, 'replays'));
      let data: Buffer;
      try {
        if (!file) throw new Error('nome inválido');
        data = readFileSync(file);
      } catch {
        return void res.writeStatus('404 Not Found').writeHeader('access-control-allow-origin', '*').end();
      }
      res.writeHeader('access-control-allow-origin', '*').writeHeader('content-type', 'application/octet-stream').writeHeader('cache-control', 'public, max-age=31536000, immutable').end(data);
    };
    app.get('/replays/:file', replay);
    app.get('/m/:machine/replays/:file', replay);
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
