// SPDX-License-Identifier: GPL-2.0-or-later
// Envelope: cada mensagem WebSocket binária carrega uma ou mais mensagens do catálogo, cada uma
// como [código u8][campos]. O decodificador nunca lança exceção: entrada inválida vira `{ ok: false }`.
import { ProtocolError, Reader, Writer } from './codec.js';
import { MESSAGES, type AnyMessage, type MessageDef, type MessageName } from './messages.js';

/** Versão do protocolo web. Incrementar a cada mudança incompatível. */
export const PROTOCOL_VERSION = 4;

const BY_CODE = new Map<number, [MessageName, MessageDef]>();
for (const [name, def] of Object.entries(MESSAGES) as [MessageName, MessageDef][]) {
  if (BY_CODE.has(def.code)) throw new Error(`código repetido no catálogo: ${def.code}`);
  BY_CODE.set(def.code, [name, def]);
}

function writeMessage(w: Writer, message: AnyMessage): void {
  const def = MESSAGES[message.type] as MessageDef | undefined;
  if (!def) throw new RangeError(`mensagem desconhecida: ${String(message.type)}`);
  w.u8(def.code);
  const values = message as unknown as Record<string, unknown>;
  for (const [field, type] of Object.entries(def.fields)) type.write(w, values[field]);
}

/** Codifica mensagens numa mensagem WebSocket. Valores fora da faixa lançam `RangeError` (bug de quem envia). */
export function encodeFrame(...messages: AnyMessage[]): Uint8Array {
  const w = new Writer();
  for (const m of messages) writeMessage(w, m);
  return w.finish();
}

export type DecodeResult = { ok: true; messages: AnyMessage[] } | { ok: false; error: string };

/**
 * Decodifica uma mensagem WebSocket. `dir` restringe a direção esperada (o servidor só aceita
 * mensagens c2s e vice-versa). Nunca lança exceção.
 */
export function decodeFrame(data: Uint8Array, dir?: 'c2s' | 's2c'): DecodeResult {
  try {
    const r = new Reader(data);
    const messages: AnyMessage[] = [];
    if (r.remaining === 0) return { ok: false, error: 'mensagem vazia' };
    while (r.remaining > 0) {
      const code = r.u8();
      const entry = BY_CODE.get(code);
      if (!entry) return { ok: false, error: `código desconhecido: ${code}` };
      const [name, def] = entry;
      if (dir && def.dir !== dir)
        return { ok: false, error: `${name}: direção ${def.dir} inesperada` };
      const out: Record<string, unknown> = { type: name };
      for (const [field, type] of Object.entries(def.fields)) out[field] = type.read(r);
      messages.push(out as AnyMessage);
    }
    return { ok: true, messages };
  } catch (error) {
    // ProtocolError = formato inválido; qualquer outra coisa também não pode derrubar o servidor
    return {
      ok: false,
      error:
        error instanceof ProtocolError
          ? error.message
          : `erro interno do decodificador: ${String(error)}`,
    };
  }
}

/** Mensagem pelo nome, com os campos tipados (atalho para montar mensagens). */
export function message<N extends MessageName>(
  type: N,
  fields: Omit<Extract<AnyMessage, { type: N }>, 'type'>,
): Extract<AnyMessage, { type: N }> {
  return { type, ...fields } as Extract<AnyMessage, { type: N }>;
}
