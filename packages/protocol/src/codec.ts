// SPDX-License-Identifier: GPL-2.0-or-later
// Tipos de campo do protocolo e seus codecs (equivalente a `BinaryWriter`/`BinaryReader`,
// src/binaryaccess.h). Little-endian, sem alinhamento. Cada tipo sabe escrever, ler (com
// verificação de limites) e gerar valores aleatórios para os testes de ida e volta.

/** Erro de formato ao decodificar; nunca escapa de `decodeFrame` (vira `{ ok: false }`). */
export class ProtocolError extends Error {}

export class Writer {
  private buf = new Uint8Array(256);
  private view = new DataView(this.buf.buffer);
  private pos = 0;

  private ensure(n: number): void {
    if (this.pos + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): void {
    this.ensure(1);
    this.view.setUint8(this.pos, v);
    this.pos += 1;
  }
  u16(v: number): void {
    this.ensure(2);
    this.view.setUint16(this.pos, v, true);
    this.pos += 2;
  }
  u32(v: number): void {
    this.ensure(4);
    this.view.setUint32(this.pos, v, true);
    this.pos += 4;
  }
  i8(v: number): void {
    this.ensure(1);
    this.view.setInt8(this.pos, v);
    this.pos += 1;
  }
  i16(v: number): void {
    this.ensure(2);
    this.view.setInt16(this.pos, v, true);
    this.pos += 2;
  }
  i32(v: number): void {
    this.ensure(4);
    this.view.setInt32(this.pos, v, true);
    this.pos += 4;
  }
  f32(v: number): void {
    this.ensure(4);
    this.view.setFloat32(this.pos, v, true);
    this.pos += 4;
  }
  f64(v: number): void {
    this.ensure(8);
    this.view.setFloat64(this.pos, v, true);
    this.pos += 8;
  }
  bytes(b: Uint8Array): void {
    this.ensure(b.length);
    this.buf.set(b, this.pos);
    this.pos += b.length;
  }
  /** Inteiro sem sinal de tamanho variável (7 bits por byte), para comprimentos. */
  varuint(v: number): void {
    let n = v;
    while (n >= 0x80) {
      this.u8((n & 0x7f) | 0x80);
      n = Math.floor(n / 128);
    }
    this.u8(n);
  }
  finish(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

export class Reader {
  private readonly view: DataView;
  private pos = 0;

  constructor(private readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get remaining(): number {
    return this.data.length - this.pos;
  }

  private need(n: number): number {
    if (this.pos + n > this.data.length)
      throw new ProtocolError(`fim inesperado: faltam ${this.pos + n - this.data.length} bytes`);
    const at = this.pos;
    this.pos += n;
    return at;
  }

  u8(): number {
    return this.view.getUint8(this.need(1));
  }
  u16(): number {
    return this.view.getUint16(this.need(2), true);
  }
  u32(): number {
    return this.view.getUint32(this.need(4), true);
  }
  i8(): number {
    return this.view.getInt8(this.need(1));
  }
  i16(): number {
    return this.view.getInt16(this.need(2), true);
  }
  i32(): number {
    return this.view.getInt32(this.need(4), true);
  }
  f32(): number {
    return this.view.getFloat32(this.need(4), true);
  }
  f64(): number {
    return this.view.getFloat64(this.need(8), true);
  }
  bytes(n: number): Uint8Array {
    const at = this.need(n);
    return this.data.subarray(at, at + n);
  }
  varuint(): number {
    let result = 0;
    let mul = 1;
    for (let i = 0; i < 5; i++) {
      const b = this.u8();
      result += (b & 0x7f) * mul;
      if ((b & 0x80) === 0) return result;
      mul *= 128;
    }
    throw new ProtocolError('varuint longo demais');
  }
}

/** Gerador determinístico para os testes (sem Math.random). */
export class TestRandom {
  constructor(private state: number) {}
  next(): number {
    this.state = (Math.imul(this.state, 1103515245) + 12345) >>> 0;
    return this.state;
  }
  int(lo: number, hi: number): number {
    return lo + (this.next() % (hi - lo + 1));
  }
}

export interface FieldType<T> {
  /** Nome para a documentação (MESSAGES.md). */
  readonly doc: string;
  write(w: Writer, v: T): void;
  read(r: Reader): T;
  /** Valor aleatório válido (testes de ida e volta). */
  sample(rnd: TestRandom): T;
}

export type Infer<F> = F extends FieldType<infer T> ? T : never;

function intType(
  doc: string,
  lo: number,
  hi: number,
  write: (w: Writer, v: number) => void,
  read: (r: Reader) => number,
): FieldType<number> {
  return {
    doc,
    write(w, v) {
      if (!Number.isInteger(v) || v < lo || v > hi)
        throw new RangeError(`${doc}: valor fora da faixa: ${v}`);
      write(w, v);
    },
    read,
    sample: (rnd) => (hi - lo < 0x100000000 ? lo + (rnd.next() % (hi - lo + 1)) : lo),
  };
}

export const u8 = intType(
  'u8',
  0,
  0xff,
  (w, v) => w.u8(v),
  (r) => r.u8(),
);
export const u16 = intType(
  'u16',
  0,
  0xffff,
  (w, v) => w.u16(v),
  (r) => r.u16(),
);
export const u32 = intType(
  'u32',
  0,
  0xffffffff,
  (w, v) => w.u32(v),
  (r) => r.u32(),
);
export const i8 = intType(
  'i8',
  -0x80,
  0x7f,
  (w, v) => w.i8(v),
  (r) => r.i8(),
);
export const i16 = intType(
  'i16',
  -0x8000,
  0x7fff,
  (w, v) => w.i16(v),
  (r) => r.i16(),
);
export const i32 = intType(
  'i32',
  -0x80000000,
  0x7fffffff,
  (w, v) => w.i32(v),
  (r) => r.i32(),
);

/** PID (0..31) ou 255 = ninguém. */
export const pidOrNone: FieldType<number> = {
  doc: 'pid (u8, 255 = nenhum)',
  write(w, v) {
    if (!(Number.isInteger(v) && ((v >= 0 && v < 32) || v === 255)))
      throw new RangeError(`pid inválido: ${v}`);
    w.u8(v);
  },
  read(r) {
    const v = r.u8();
    if (v >= 32 && v !== 255) throw new ProtocolError(`pid inválido: ${v}`);
    return v;
  },
  sample: (rnd) => (rnd.next() % 5 === 0 ? 255 : rnd.next() % 32),
};

export const pid: FieldType<number> = {
  doc: 'pid (u8, 0..31)',
  write(w, v) {
    if (!Number.isInteger(v) || v < 0 || v >= 32) throw new RangeError(`pid inválido: ${v}`);
    w.u8(v);
  },
  read(r) {
    const v = r.u8();
    if (v >= 32) throw new ProtocolError(`pid inválido: ${v}`);
    return v;
  },
  sample: (rnd) => rnd.next() % 32,
};

export const f32: FieldType<number> = {
  doc: 'f32',
  write: (w, v) => w.f32(v),
  read: (r) => r.f32(),
  sample: (rnd) => Math.fround((rnd.next() % 200000) / 100 - 1000),
};

export const f64: FieldType<number> = {
  doc: 'f64',
  write: (w, v) => w.f64(v),
  read: (r) => r.f64(),
  sample: (rnd) => (rnd.next() - 2 ** 31) / 3,
};

export const bool: FieldType<boolean> = {
  doc: 'bool (u8 0/1)',
  write: (w, v) => w.u8(v ? 1 : 0),
  read(r) {
    const v = r.u8();
    if (v > 1) throw new ProtocolError(`bool inválido: ${v}`);
    return v === 1;
  },
  sample: (rnd) => rnd.next() % 2 === 1,
};

/** UTF-8 sem depender de TextEncoder (o pacote roda no navegador, no Node e em workers). */
export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
  }
  return Uint8Array.from(out);
}

/** UTF-8 estrito: sequências inválidas, sobrelongas ou surrogates são erro. */
export function utf8Decode(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length;) {
    const c = b[i] as number;
    let n: number;
    let cp: number;
    let min: number;
    if (c < 0x80) [n, cp, min] = [0, c, 0];
    else if ((c & 0xe0) === 0xc0) [n, cp, min] = [1, c & 0x1f, 0x80];
    else if ((c & 0xf0) === 0xe0) [n, cp, min] = [2, c & 0x0f, 0x800];
    else if ((c & 0xf8) === 0xf0) [n, cp, min] = [3, c & 0x07, 0x10000];
    else throw new ProtocolError('UTF-8 inválido');
    for (let k = 1; k <= n; k++) {
      const cc = b[i + k];
      if (cc === undefined || (cc & 0xc0) !== 0x80) throw new ProtocolError('UTF-8 inválido');
      cp = (cp << 6) | (cc & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff))
      throw new ProtocolError('UTF-8 inválido');
    s += String.fromCodePoint(cp);
    i += n + 1;
  }
  return s;
}

/** Texto UTF-8 com comprimento (varuint, em bytes) limitado a `max`. */
export function str(max: number): FieldType<string> {
  return {
    doc: `string (UTF-8, até ${max} bytes)`,
    write(w, v) {
      const b = utf8Encode(v);
      if (b.length > max) throw new RangeError(`string longa demais (${b.length} > ${max})`);
      w.varuint(b.length);
      w.bytes(b);
    },
    read(r) {
      const n = r.varuint();
      if (n > max) throw new ProtocolError(`string longa demais (${n} > ${max})`);
      return utf8Decode(r.bytes(n));
    },
    sample(rnd) {
      const chars = 'abcXYZ 019çãé€🙂';
      let s = '';
      for (let i = rnd.next() % 12; i > 0; i--) s += [...chars][rnd.next() % [...chars].length];
      while (utf8Encode(s).length > max) s = s.slice(0, -1);
      return s;
    },
  };
}

/** Enumeração por nome, transmitida como u8 (índice na lista). */
export function enumOf<const V extends readonly string[]>(...values: V): FieldType<V[number]> {
  return {
    doc: `u8 enum: ${values.map((v, i) => `${i} = ${v}`).join(', ')}`,
    write(w, v) {
      const i = values.indexOf(v);
      if (i < 0) throw new RangeError(`valor de enum inválido: ${v}`);
      w.u8(i);
    },
    read(r) {
      const i = r.u8();
      const v = values[i];
      if (v === undefined) throw new ProtocolError(`enum fora da faixa: ${i}`);
      return v;
    },
    sample: (rnd) => values[rnd.next() % values.length] as V[number],
  };
}

/** Lista com comprimento (varuint) limitado a `max`. */
export function list<T>(item: FieldType<T>, max: number): FieldType<T[]> {
  return {
    doc: `lista (até ${max}) de ${item.doc}`,
    write(w, v) {
      if (v.length > max) throw new RangeError(`lista longa demais (${v.length} > ${max})`);
      w.varuint(v.length);
      for (const x of v) item.write(w, x);
    },
    read(r) {
      const n = r.varuint();
      if (n > max) throw new ProtocolError(`lista longa demais (${n} > ${max})`);
      // cada item tem ao menos 1 byte: entrada truncada não aloca listas enormes
      if (n > r.remaining) throw new ProtocolError('lista maior que os dados');
      const out: T[] = [];
      for (let i = 0; i < n; i++) out.push(item.read(r));
      return out;
    },
    sample(rnd) {
      const out: T[] = [];
      for (let i = rnd.next() % Math.min(max + 1, 6); i > 0; i--) out.push(item.sample(rnd));
      return out;
    },
  };
}

/** Campo opcional: u8 0 = ausente, 1 = presente. */
export function optional<T>(item: FieldType<T>): FieldType<T | null> {
  return {
    doc: `opcional (u8 0/1) de ${item.doc}`,
    write(w, v) {
      w.u8(v === null ? 0 : 1);
      if (v !== null) item.write(w, v);
    },
    read(r) {
      const tag = r.u8();
      if (tag > 1) throw new ProtocolError(`marcador de opcional inválido: ${tag}`);
      return tag === 1 ? item.read(r) : null;
    },
    sample: (rnd) => (rnd.next() % 3 === 0 ? null : item.sample(rnd)),
  };
}

export type Fields = Record<string, FieldType<unknown>>;
export type InferFields<F extends Fields> = { [K in keyof F]: Infer<F[K]> };

/** Estrutura: campos na ordem de declaração. */
export function struct<F extends Fields>(
  fields: F,
  doc = 'estrutura',
): FieldType<InferFields<F>> & { fields: F } {
  const entries = Object.entries(fields);
  return {
    doc,
    fields,
    write(w, v) {
      for (const [k, t] of entries) t.write(w, (v as Record<string, unknown>)[k]);
    },
    read(r) {
      const out: Record<string, unknown> = {};
      for (const [k, t] of entries) out[k] = t.read(r);
      return out as InferFields<F>;
    },
    sample(rnd) {
      const out: Record<string, unknown> = {};
      for (const [k, t] of entries) out[k] = t.sample(rnd);
      return out as InferFields<F>;
    },
  };
}
