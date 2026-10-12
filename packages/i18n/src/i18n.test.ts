// SPDX-License-Identifier: GPL-2.0-or-later
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGS } from './catalogs.generated.js';
import { catalog, convertLanguage, detectLocale, isLatin1, LOCALES, phrases, textLines, translate, WEB_TEXTS } from './index.js';

const languages = join(import.meta.dirname, '../../../languages');
const read = (name: string) => readFileSync(join(languages, name), 'latin1');
const FILES = { 'pt-BR': 'ptBR', fi: 'fi', it: 'it' } as const;

describe('catálogos gerados x languages/*.txt', () => {
  it('estão atualizados (pnpm i18n:generate)', () => {
    for (const [locale, file] of Object.entries(FILES)) {
      const fresh = convertLanguage(read('en.txt'), read(`${file}.txt`));
      const current = CATALOGS[locale as keyof typeof FILES];
      expect(current.texts).toEqual(fresh.texts);
      expect([current.name, current.numberLocale]).toEqual([fresh.name, fresh.numberLocale]);
      expect(current.help).toEqual(textLines(read(`help.${file}.txt`)));
      expect(current.splash).toEqual(textLines(read(`splash.${file}.txt`)));
    }
  });

  it('cada idioma tem as mesmas 603 frases do en.txt', () => {
    expect(phrases(read('en.txt'))).toHaveLength(603);
    for (const file of Object.values(FILES)) expect(phrases(read(`${file}.txt`))).toHaveLength(603);
  });

  it('nomes e localidades numéricas', () => {
    expect(catalog('pt-BR').name).toBe('Português (Brasil)');
    expect(catalog('pt-BR').numberLocale).toBe('pt_BR');
    expect(catalog('fi').name).toBe('suomi');
    expect(catalog('it').name).toBe('italiano');
  });

  it('arquivo desalinhado é recusado, como no original', () => {
    expect(() => convertLanguage('a\nb\n', 'x\n')).toThrow(/inválido/);
  });

  it('placeholders das traduções batem com o inglês (exceto 2 casos do original)', () => {
    const known = ['Downloading map "$1"...', "Map pictures saved to the directory '$1'."];
    const mismatches: string[] = [];
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(catalog(locale).texts)) {
        const ph = (s: string) => (s.match(/\$\d/g) ?? []).sort().join();
        if (ph(key) !== ph(value) && !known.includes(key)) mismatches.push(`${locale}: ${key}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('tudo é Latin-1 (as fontes do jogo não têm outros glifos)', () => {
    for (const locale of LOCALES) {
      const c = catalog(locale);
      for (const text of [...Object.values(c.texts), ...c.help, ...c.splash]) expect(isLatin1(text), text).toBe(true);
      for (const [key, value] of Object.entries(WEB_TEXTS[locale] ?? {})) expect(isLatin1(key) && isLatin1(value), value).toBe(true);
    }
  });
});

describe('translate (semântica de _() do original)', () => {
  it('traduz e substitui $1..$5', () => {
    expect(translate('en', 'Connected to $1 ($2)', 'Sala', '1.2.3.4')).toBe('Connected to Sala (1.2.3.4)');
    expect(translate('pt-BR', 'Connected to $1 ($2)', 'Sala', '1.2.3.4')).toBe(
      catalog('pt-BR').texts['Connected to $1 ($2)']!.replace('$1', 'Sala').replace('$2', '1.2.3.4'),
    );
  });

  it('$n sem argumento vira vazio; texto desconhecido fica em inglês', () => {
    expect(translate('pt-BR', 'Downloading map "$1"...', 'outgun1')).toBe('Copiando o mapa "outgun1" (CRC )...');
    expect(translate('pt-BR', 'Texto novo $1', 'x')).toBe('Texto novo x');
  });

  it('frase @MISSING@ no italiano cai no inglês', () => {
    const missing = phrases(read('en.txt')).find((k, i) => phrases(read('it.txt'))[i]!.startsWith('@MISSING@'))!;
    expect(translate('it', missing)).toBe(missing);
  });

  it('textos novos da web em pt-BR', () => {
    expect(translate('pt-BR', 'Ranked')).toBe('Ranqueado');
    expect(translate('pt-BR', 'Season $1', '3')).toBe('Temporada 3');
    expect(translate('fi', 'Ranked')).toBe('Ranked');
  });
});

describe('detectLocale', () => {
  it('usa a primeira língua suportada do navegador', () => {
    expect(detectLocale(['pt-PT', 'en'])).toBe('pt-BR');
    expect(detectLocale(['de-DE', 'fi-FI'])).toBe('fi');
    expect(detectLocale(['it'])).toBe('it');
    expect(detectLocale(['de'])).toBe('en');
  });
});
