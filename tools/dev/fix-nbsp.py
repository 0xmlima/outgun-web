# SPDX-License-Identifier: GPL-2.0-or-later
# A ferramenta Write do agente grava " " como NBSP literal; o lint recusa. Rodar na raiz depois de
# escrever código: python3 tools/dev/fix-nbsp.py
import glob

NBSP = ' '
files = glob.glob('packages/*/src/**/*.ts', recursive=True) + glob.glob('apps/*/src/**/*.ts*', recursive=True)
files += glob.glob('tools/*/src/**/*.ts', recursive=True) + glob.glob('tools/**/*.mjs', recursive=True)
for p in files:
    s = open(p, encoding='utf-8').read()
    if NBSP in s:
        open(p, 'w', encoding='utf-8').write(s.replace(NBSP, '\\u00a0'))
        print('corrigido', p)
