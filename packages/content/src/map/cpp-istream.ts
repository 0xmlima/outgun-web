// SPDX-License-Identifier: GPL-2.0-or-later
// Leitura de valores com a semântica de `std::istringstream` (libstdc++, locale "C"), como o parser
// de mapas original faz em `Map::parse_line`. O que importa reproduzir:
// - `good()` falso depois de ler o último valor da linha (eofbit), o que decide campos opcionais;
// - falha (`failbit`) em números malformados e em leituras depois de uma falha;
// - números aceitos: inteiros decimais e o subconjunto de ponto flutuante que o num_get coleta.

/** `isspace` no locale "C". Atenção: 0xA0 (espaço não separável) NÃO é espaço aqui. */
function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\v' || ch === '\f' || ch === '\r';
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;

export class CppIStream {
  private pos = 0;
  private failed = false;
  private eofReached = false;

  constructor(private readonly text: string) {}

  /** `ist.good()` */
  good(): boolean {
    return !this.failed && !this.eofReached;
  }

  /** `!ist` */
  fail(): boolean {
    return this.failed;
  }

  /** `ist.eof()` */
  eof(): boolean {
    return this.eofReached;
  }

  /** Sentinela das extrações formatadas: pula espaços; no fim do texto marca eof e falha. */
  private sentry(): boolean {
    if (this.failed || this.eofReached) {
      this.failed = true;
      return false;
    }
    while (this.pos < this.text.length && isSpace(this.text[this.pos] as string)) this.pos++;
    if (this.pos >= this.text.length) {
      this.eofReached = true;
      this.failed = true;
      return false;
    }
    return true;
  }

  private markEofIfAtEnd(): void {
    if (this.pos >= this.text.length) this.eofReached = true;
  }

  /** `ist >> std::string` */
  readString(): string {
    if (!this.sentry()) return '';
    const start = this.pos;
    while (this.pos < this.text.length && !isSpace(this.text[this.pos] as string)) this.pos++;
    this.markEofIfAtEnd();
    return this.text.slice(start, this.pos);
  }

  /** `ist >> char`: um caractere não branco; não marca eof por si só. */
  readChar(): string {
    if (!this.sentry()) return '';
    return this.text[this.pos++] as string;
  }

  /** `ist >> int` (base decimal). */
  readInt(): number {
    if (!this.sentry()) return 0;
    const start = this.pos;
    if (this.text[this.pos] === '+' || this.text[this.pos] === '-') this.pos++;
    const digitsStart = this.pos;
    while (isDigit(this.text[this.pos])) this.pos++;
    this.markEofIfAtEnd();
    if (this.pos === digitsStart) {
      this.failed = true;
      return 0;
    }
    const value = Number(this.text.slice(start, this.pos));
    if (value < INT_MIN || value > INT_MAX) {
      this.failed = true;
      return value < 0 ? INT_MIN : INT_MAX;
    }
    return value;
  }

  /**
   * `ist >> double`: coleta sinal, dígitos, ponto, dígitos e expoente (só depois de algum dígito)
   * como o `num_get` da libstdc++, e converte com strtod; falha se a conversão não consumir tudo.
   */
  readDouble(): number {
    if (!this.sentry()) return 0;
    const start = this.pos;
    const t = this.text;
    if (t[this.pos] === '+' || t[this.pos] === '-') this.pos++;
    let mantissa = false;
    while (isDigit(t[this.pos])) {
      this.pos++;
      mantissa = true;
    }
    if (t[this.pos] === '.') {
      this.pos++;
      while (isDigit(t[this.pos])) {
        this.pos++;
        mantissa = true;
      }
    }
    if (mantissa && (t[this.pos] === 'e' || t[this.pos] === 'E')) {
      this.pos++;
      if (t[this.pos] === '+' || t[this.pos] === '-') this.pos++;
      while (isDigit(t[this.pos])) this.pos++;
    }
    this.markEofIfAtEnd();
    const collected = t.slice(start, this.pos);
    // strtod precisa consumir toda a coleta ("1e", "+", "." falham); Number() aceita "" e espaços.
    const value = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(collected) ? Number(collected) : NaN;
    if (!Number.isFinite(value)) {
      this.failed = true;
      return 0;
    }
    return value;
  }

  /** `std::getline(ist, s)` depois de extrações: o restante da linha, ou falha se já no fim. */
  readRestOfLine(): string {
    if (this.failed || this.eofReached || this.pos >= this.text.length) {
      this.failed = true;
      this.eofReached = true;
      return '';
    }
    const rest = this.text.slice(this.pos);
    this.pos = this.text.length;
    this.eofReached = true;
    return rest;
  }
}
