// SPDX-License-Identifier: GPL-2.0-or-later
// Gera packages/i18n/src/catalogs.generated.ts a partir de languages/*.txt (ISO-8859-1).
// Uso: pnpm i18n:generate
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertLanguage, textLines } from '../../packages/i18n/dist/convert.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (name) => readFileSync(join(root, 'languages', name), 'latin1');
const english = read('en.txt');
const files = { en: 'en', 'pt-BR': 'ptBR', fi: 'fi', it: 'it' };
const catalogs = {};
for (const [locale, file] of Object.entries(files)) {
  const converted =
    locale === 'en'
      ? { name: 'English', numberLocale: 'en', texts: {} }
      : convertLanguage(english, read(`${file}.txt`));
  catalogs[locale] = {
    ...converted,
    help: textLines(read(`help.${file}.txt`)),
    splash: textLines(read(`splash.${file}.txt`)),
  };
}
const out = `// SPDX-License-Identifier: GPL-2.0-or-later
// GERADO por tools/i18n-convert/convert.mjs a partir de languages/*.txt. Não edite à mão.
import type { LanguageCatalog, Locale } from './index.js';

export const CATALOGS: Record<Locale, LanguageCatalog> = ${JSON.stringify(catalogs, null, 2)};
`;
writeFileSync(join(root, 'packages/i18n/src/catalogs.generated.ts'), out);
console.log(
  Object.entries(catalogs)
    .map(([l, c]) => `${l}: ${Object.keys(c.texts).length} frases, ajuda ${c.help.length} linhas`)
    .join('\n'),
);
