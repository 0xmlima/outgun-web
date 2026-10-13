// SPDX-License-Identifier: GPL-2.0-or-later
// Conexão WebSocket com o servidor de jogo (/rooms/:id): manda `hello`, entrega as mensagens à
// `ClientSession` e avisa quando cai. Com `simulate`, as mensagens passam por uma rede simulada
// (atraso, jitter e perda com retransmissão) nos dois sentidos — depuração do OG-064 (?lag=&loss=).
import { SimulatedLink, type LinkConditions } from '@outgun/netcode';
import { decodeFrame, encodeFrame, message, PROTOCOL_VERSION, type AnyMessage } from '@outgun/protocol';

export interface ConnectionHandlers {
  onMessages(messages: AnyMessage[]): void;
  /** A conexão caiu ou foi recusada (`reason` vem do código de fechamento). */
  onClose(reason: string): void;
}

/** Endereço padrão do servidor: `VITE_GAME_SERVER` ou a porta 7700 da mesma máquina. */
export function defaultServerUrl(): string {
  const fromEnv = import.meta.env.VITE_GAME_SERVER;
  if (fromEnv) return fromEnv;
  const secure = location.protocol === 'https:';
  return `${secure ? 'wss' : 'ws'}://${location.hostname || 'localhost'}:7700`;
}

export class GameConnection {
  private readonly ws: WebSocket;
  private readonly up: SimulatedLink<Uint8Array> | null;
  private readonly down: SimulatedLink<Uint8Array> | null;
  private pump: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    url: string,
    ticket: string,
    private readonly handlers: ConnectionHandlers,
    simulate?: LinkConditions,
    /** Token da vaga guardada (OG-047): vai junto do `hello` na volta de uma queda. */
    resumeToken?: string,
  ) {
    this.up = simulate ? new SimulatedLink(simulate, 11) : null;
    this.down = simulate ? new SimulatedLink(simulate, 12) : null;
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () =>
      this.send([
        message('hello', { protocol: PROTOCOL_VERSION, ticket, client: 'outgun-web' }),
        ...(resumeToken ? [message('resume', { token: resumeToken })] : []),
      ]);
    this.ws.onmessage = (ev) => {
      if (!(ev.data instanceof ArrayBuffer)) return;
      const data = new Uint8Array(ev.data);
      if (this.down) {
        this.down.send(data, performance.now());
        this.schedulePump();
      } else this.deliver(data);
    };
    this.ws.onclose = (ev) => this.finish(ev.reason || `conexão fechada (${ev.code})`);
    this.ws.onerror = () => this.finish('não foi possível conectar ao servidor');
  }

  private deliver(data: Uint8Array): void {
    const decoded = decodeFrame(data, 's2c');
    if (!decoded.ok) return this.finish(`mensagem inválida do servidor: ${decoded.error}`);
    this.handlers.onMessages(decoded.messages);
  }

  private finish(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.handlers.onClose(reason);
  }

  send(messages: AnyMessage[]): void {
    // antes de abrir não há sessão no servidor (o primeiro envio é o `hello`, no `onopen`)
    if (this.closed || messages.length === 0 || this.ws.readyState !== WebSocket.OPEN) return;
    const data = encodeFrame(...messages);
    if (this.up) {
      this.up.send(data, performance.now());
      this.schedulePump();
    } else this.ws.send(data as Uint8Array<ArrayBuffer>);
  }

  /** Entrega o que já "chegou" na rede simulada e agenda a próxima chegada. */
  private schedulePump(): void {
    if (!this.up || !this.down) return;
    if (this.pump !== null) clearTimeout(this.pump);
    const next = Math.min(this.up.nextArrival(), this.down.nextArrival());
    if (next === Infinity) return;
    this.pump = setTimeout(() => {
      this.pump = null;
      const now = performance.now();
      for (const data of this.up?.receive(now) ?? []) if (this.ws.readyState === WebSocket.OPEN) this.ws.send(data as Uint8Array<ArrayBuffer>);
      for (const data of this.down?.receive(now) ?? []) if (!this.closed) this.deliver(data);
      this.schedulePump();
    }, Math.max(0, next - performance.now()));
  }

  close(): void {
    this.closed = true;
    if (this.pump !== null) clearTimeout(this.pump);
    this.ws.close(1000, 'saiu');
  }
}
