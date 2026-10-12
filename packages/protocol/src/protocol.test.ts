// SPDX-License-Identifier: GPL-2.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TestRandom } from './codec.js';
import { generateMessagesMd } from './docs.js';
import { decodeFrame, encodeFrame, message } from './frame.js';
import { MESSAGES, type AnyMessage, type MessageDef, type MessageName } from './messages.js';

const names = Object.keys(MESSAGES) as MessageName[];

function sample(name: MessageName, rnd: TestRandom): AnyMessage {
  const def = MESSAGES[name] as MessageDef;
  const out: Record<string, unknown> = { type: name };
  for (const [field, type] of Object.entries(def.fields)) out[field] = type.sample(rnd);
  return out as AnyMessage;
}

describe('catálogo', () => {
  it('códigos únicos e mensagens de entrada/saída coerentes', () => {
    const codes = names.map((n) => MESSAGES[n].code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(MESSAGES.hello.dir).toBe('c2s');
    expect(MESSAGES.frame.channel).toBe('frame');
  });

  it('MESSAGES.md está em dia com o catálogo', () => {
    const file = readFileSync(new URL('../MESSAGES.md', import.meta.url), 'utf8');
    expect(file).toBe(generateMessagesMd());
  });
});

describe('ida e volta', () => {
  for (const name of names) {
    it(name, () => {
      const rnd = new TestRandom(MESSAGES[name].code * 7919);
      for (let i = 0; i < 200; i++) {
        const m = sample(name, rnd);
        const decoded = decodeFrame(encodeFrame(m), MESSAGES[name].dir);
        expect(decoded).toEqual({ ok: true, messages: [m] });
      }
    });
  }

  it('várias mensagens numa mensagem WebSocket', () => {
    const rnd = new TestRandom(42);
    const batch = names.map((n) => sample(n, rnd));
    expect(decodeFrame(encodeFrame(...batch))).toEqual({ ok: true, messages: batch });
  });

  it('atalho tipado', () => {
    const bytes = encodeFrame(message('input', { clientFrame: 7, controls: 9, gundir: 1024 }));
    expect([...bytes]).toEqual([10, 7, 9, 0, 4]);
  });

  it('valores fora da faixa são erro de quem envia', () => {
    expect(() => encodeFrame(message('frags', { pid: 32, frags: 0 }))).toThrow(RangeError);
    expect(() => encodeFrame(message('setName', { name: 'x'.repeat(65) }))).toThrow(RangeError);
  });
});

describe('decodificador robusto', () => {
  it('rejeita direção errada, código desconhecido, truncado e lixo no fim', () => {
    const hello = encodeFrame(message('hello', { protocol: 1, ticket: 'abc', client: 'web' }));
    expect(decodeFrame(hello, 's2c')).toMatchObject({ ok: false });
    expect(decodeFrame(new Uint8Array([250]))).toMatchObject({ ok: false });
    expect(decodeFrame(hello.subarray(0, hello.length - 1))).toMatchObject({ ok: false });
    expect(decodeFrame(new Uint8Array([...hello, 13, 99]))).toMatchObject({ ok: false });
    expect(decodeFrame(new Uint8Array([]))).toMatchObject({ ok: false });
  });

  it('nunca lança exceção com entrada aleatória (fuzz)', () => {
    // 1M casos: metade lixo puro, metade mensagens válidas com bytes corrompidos
    const cases = Number(process.env.FUZZ_CASES ?? 1_000_000);
    const rnd = new TestRandom(2026);
    const valid = names.map((n) => encodeFrame(sample(n, rnd)));
    let rejected = 0;
    for (let i = 0; i < cases; i++) {
      let data: Uint8Array;
      if (i % 2 === 0) {
        data = new Uint8Array(rnd.next() % 64);
        for (let k = 0; k < data.length; k++) data[k] = rnd.next() & 0xff;
      } else {
        data = (valid[rnd.next() % valid.length] as Uint8Array).slice();
        for (let k = 1 + (rnd.next() % 3); k > 0 && data.length > 0; k--)
          data[rnd.next() % data.length] = rnd.next() & 0xff;
        if (rnd.next() % 4 === 0) data = data.subarray(0, rnd.next() % (data.length + 1));
      }
      const result = decodeFrame(data);
      if (!result.ok) {
        rejected++;
        expect(result.error).not.toMatch(/erro interno/);
      }
    }
    expect(rejected).toBeGreaterThan(cases / 4);
  }, 120_000);
});
