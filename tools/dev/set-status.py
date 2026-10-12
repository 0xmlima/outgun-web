# SPDX-License-Identifier: GPL-2.0-or-later
# Muda o status de um card no cabeçalho e na tabela da seção 10 do PLAN. Uso: python3 tools/dev/set-status.py 042 "Em andamento"
import sys, re, glob, os

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
cid, status = sys.argv[1], sys.argv[2]
card = glob.glob(os.path.join(root, 'plan/cards', f'OG-{cid}-*.md'))[0]
s = open(card, encoding='utf-8').read()
s = re.sub(r'^\| Status \| .* \|$', f'| Status | {status} |', s, count=1, flags=re.M)
open(card, 'w', encoding='utf-8').write(s)
p = os.path.join(root, 'plan/PLAN.md')
t = open(p, encoding='utf-8').read()
t, n = re.subn(rf'^(\| \[OG-{cid}\]\(.*\| )[^|]+( \|)$', lambda m: m.group(1) + status + m.group(2), t, count=1, flags=re.M)
open(p, 'w', encoding='utf-8').write(t)
print(cid, status, 'table-updated' if n else 'TABLE NOT FOUND')
