// SPDX-License-Identifier: GPL-2.0-or-later
// Cliente WebSocket cru para os testes de integração: fala o protocolo binário direto, como um
// cliente modificado faria (só usado em *.test.ts).
import { decodeFrame, encodeFrame, message, PROTOCOL_VERSION, type AnyMessage } from '@outgun/protocol';

export class WsTestClient {
  readonly ws: WebSocket;
  readonly received: AnyMessage[] = [];
  closed: { code: number; reason: string } | null = null;
  private readonly opened: Promise<void>;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.opened = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('falha ao conectar'));
    });
    this.ws.onmessage = (e) => {
      const r = decodeFrame(new Uint8Array(e.data as ArrayBuffer), 's2c');
      if (!r.ok) throw new Error(r.error);
      this.received.push(...r.messages);
      for (const m of r.messages) if (m.type === 'mapChange') this.send(message('clientReady', {}));
    };
    this.ws.onclose = (e) => (this.closed = { code: e.code, reason: e.reason });
  }

  async hello(ticket: string, protocol = PROTOCOL_VERSION, ...extra: AnyMessage[]): Promise<void> {
    await this.opened;
    this.send(message('hello', { protocol, ticket, client: 'teste' }), ...extra);
  }

  send(...m: AnyMessage[]): void {
    this.ws.send(encodeFrame(...m));
  }

  of<T extends AnyMessage['type']>(type: T): Extract<AnyMessage, { type: T }>[] {
    return this.received.filter((m): m is Extract<AnyMessage, { type: T }> => m.type === type);
  }

  async until(pred: () => boolean, ms = 3000): Promise<void> {
    const end = Date.now() + ms;
    while (!pred()) {
      if (Date.now() > end) throw new Error('tempo esgotado esperando condição');
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  close(): void {
    this.ws.close();
  }
}
