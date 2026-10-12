#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Oráculo do Outgun original (card OG-002). Uso: tools/parity/oracle.sh <comando> [args]
#   build                 constrói a imagem Docker a partir dos fontes intocados
#   help                  lista os comandos do container (server, replay, mappic, mapgen, ...)
#   compile-commands      gera compile_commands.json na raiz (para clangd navegar em src/)
#   <outro>               repassado ao container; resultados em tools/parity/out/ (= /out no container)
# O container roda sem rede (--network none): o original tenta falar com master server e ranking antigos.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ORACLE_VERSION=1
IMAGE="${OUTGUN_ORACLE_IMAGE:-outgun-oracle:$ORACLE_VERSION}"
OUT="$ROOT/tools/parity/out"

if ! command -v docker > /dev/null && [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then
  PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
fi

cmd="${1:-help}"
case "$cmd" in
  build)
    shift
    docker build -f "$ROOT/tools/parity/docker/Dockerfile" -t "$IMAGE" \
      --label "org.opencontainers.image.revision=$(git -C "$ROOT" rev-parse HEAD 2> /dev/null || echo unknown)" \
      "$@" "$ROOT"
    ;;
  compile-commands)
    mkdir -p "$OUT"
    docker run --rm --network none -v "$OUT:/out" "$IMAGE" compile-commands > /dev/null
    sed "s#/outgun/src#$ROOT/src#g" "$OUT/compile_commands.json" > "$ROOT/compile_commands.json"
    echo "compile_commands.json gerado na raiz (caminhos apontando para $ROOT/src)"
    ;;
  *)
    mkdir -p "$OUT"
    docker run --rm --network none -v "$OUT:/out" "$IMAGE" "$@"
    ;;
esac
