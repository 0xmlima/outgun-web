// SPDX-License-Identifier: GPL-2.0-or-later
// Conversão dos arquivos de idioma do original (languages/*.txt) com a semântica de
// `Language::load` (src/language.cpp): a chave de cada frase é o texto em inglês da mesma posição em
// en.txt; `@MISSING@` mantém o inglês; a frase "locale" define a localidade numérica.

export interface ConvertedLanguage {
  /** Nome do idioma no próprio idioma (tradução da frase "English"). */
  name: string;
  /** Localidade para números, ex. "pt_BR" (frase "locale"). */
  numberLocale: string;
  /** Inglês → tradução. Frases sem tradução ficam de fora (caem no inglês). */
  texts: Record<string, string>;
}

/** `getline_smart` + `getline_skip_comments`: quebra em \n/\r, ignora vazias e linhas com ';' no início. */
export function phrases(text: string): string[] {
  return text.split(/[\r\n]+/).filter((line) => line !== '' && line[0] !== ';');
}

export function convertLanguage(englishFile: string, languageFile: string): ConvertedLanguage {
  const keys = phrases(englishFile);
  const values = phrases(languageFile);
  if (keys.length !== values.length) {
    throw new Error(`arquivo de idioma inválido: ${values.length} frases para ${keys.length} em en.txt`);
  }
  const texts: Record<string, string> = {};
  let numberLocale = 'C';
  keys.forEach((key, i) => {
    const value = values[i] as string;
    if (value.startsWith('@MISSING@')) return;
    if (key === 'locale') numberLocale = value;
    else texts[key] = value;
  });
  return { name: texts.English ?? 'English', numberLocale, texts };
}

/** Texto livre (ajuda, tela inicial): linhas, sem as vazias do fim. */
export function textLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 0 && (lines[lines.length - 1] as string).trim() === '') lines.pop();
  return lines;
}
