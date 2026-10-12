#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Formata e roda `pnpm verify`; só devolve sucesso se tudo passou (usar antes de cada commit).
# O pnpm vem do corepack (não está no PATH desta máquina): um atalho temporário vai no PATH, porque
# o turbo chama `pnpm` em subprocessos.
cd "$(dirname "$0")/../.." || exit 1
if ! command -v pnpm >/dev/null; then
  SHIM=$(mktemp -d)
  printf '#!/bin/sh\nexec corepack pnpm "$@"\n' > "$SHIM/pnpm"
  chmod +x "$SHIM/pnpm"
  export PATH="$SHIM:$PATH"
fi
pnpm format >/dev/null 2>&1
LOG=$(mktemp)
if pnpm run verify >"$LOG" 2>&1; then grep -E 'OK:' "$LOG"; rm "$LOG"; exit 0; fi
grep -E 'rror|problems|failed|×' "$LOG" | head -20; rm "$LOG"; exit 1
