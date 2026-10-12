// SPDX-License-Identifier: GPL-2.0-or-later
// Traduções do Outgun (en, pt-BR, fi, it) com a mesma semântica do original: a chave é o texto em
// inglês e `$1..$5` são substituídos pelos argumentos (`_()` em src/language.cpp).
import { CATALOGS } from './catalogs.generated.js';
import { WEB_TEXTS } from './web-texts.js';

export { convertLanguage, phrases, textLines, type ConvertedLanguage } from './convert.js';
export { WEB_TEXTS } from './web-texts.js';

/** Idiomas do Outgun original (languages/). */
export const LOCALES = ['en', 'pt-BR', 'fi', 'it'] as const;

export type Locale = (typeof LOCALES)[number];

export interface LanguageCatalog {
  name: string;
  numberLocale: string;
  texts: Readonly<Record<string, string>>;
  /** Ajuda do jogo (F1), linha a linha. */
  help: readonly string[];
  /** Texto da tela inicial, linha a linha. */
  splash: readonly string[];
}

export function catalog(locale: Locale): LanguageCatalog {
  return CATALOGS[locale];
}

/**
 * `_()` do original: traduz o texto em inglês (ou o mantém) e troca `$1..$5` pelos argumentos;
 * um `$n` sem argumento vira texto vazio, como no original.
 */
export function translate(locale: Locale, text: string, ...args: string[]): string {
  const translated = CATALOGS[locale].texts[text] ?? WEB_TEXTS[locale]?.[text] ?? text;
  let out = '';
  for (let i = 0; i < translated.length; i++) {
    const ch = translated[i] as string;
    const digit = translated.charCodeAt(i + 1) - 48;
    if (ch === '$' && i + 1 < translated.length && digit >= 1 && digit <= 5) {
      out += args[digit - 1] ?? '';
      i++;
    } else out += ch;
  }
  return out;
}

/** Idioma preferido a partir de `navigator.languages`; inglês se nenhum for suportado. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const lang = tag.toLowerCase();
    if (lang.startsWith('pt')) return 'pt-BR';
    if (lang.startsWith('fi')) return 'fi';
    if (lang.startsWith('it')) return 'it';
    if (lang.startsWith('en')) return 'en';
  }
  return 'en';
}

/** As fontes do jogo só têm glifos Latin-1 (OG-013): textos fora disso aparecem como "?". */
export function isLatin1(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 0xff) return false;
  return true;
}
