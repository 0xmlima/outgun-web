#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Monta DIR/a (_legacy/src/ original) e DIR/b (src/ com tools/parity/patches/001-trace.patch) para editar o
# patch do oráculo. Depois de editar DIR/b: (cd DIR && diff -ruN a b > REPO/tools/parity/patches/001-trace.patch)
# e `pnpm oracle build`. Uso: tools/dev/patch-workspace.sh DIR
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="${1:?informe a pasta}"
rm -rf "$DIR/a" "$DIR/b"
mkdir -p "$DIR/a" "$DIR/b"
cp -R "$ROOT/_legacy/src/." "$DIR/a/"
cp -R "$ROOT/_legacy/src/." "$DIR/b/"
(cd "$DIR/b" && patch -p1 -s < "$ROOT/tools/parity/patches/001-trace.patch")
echo "pronto: $DIR/a (original) e $DIR/b (com o patch)"
