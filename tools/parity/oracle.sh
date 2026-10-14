#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Oráculo do Outgun original (card OG-002). Uso: tools/parity/oracle.sh <comando> [args]
#   build                 constrói a imagem Docker a partir dos fontes intocados
#   help                  lista os comandos do container (server, replay, mappic, mapgen, ...)
#   compile-commands      gera _legacy/compile_commands.json (para clangd navegar em _legacy/src/)
#   trace CENÁRIO         grava tools/parity/traces/CENÁRIO.jsonl.gz a partir de tools/parity/scenarios/CENÁRIO.txt
#   allegro NOME [ARGS]   compila tools/parity/fixtures/NOME.cpp só com a Allegro (fontes em /game-fonts)
#   fixture NOME [ARGS]   compila e roda tools/parity/fixtures/NOME.cpp ligado ao código original (stdout)
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
    sed "s#/outgun/src#$ROOT/_legacy/src#g" "$OUT/compile_commands.json" > "$ROOT/_legacy/compile_commands.json"
    echo "compile_commands.json gerado em _legacy/ (caminhos apontando para $ROOT/_legacy/src)"
    ;;
  *)
    mkdir -p "$OUT"
    docker run --rm --network none -v "$OUT:/out" -v "$ROOT/tools/parity/fixtures:/fixtures:ro" \
      -v "$ROOT/tools/parity/scenarios:/scenarios:ro" -v "$ROOT/tools/parity/traces:/traces" \
      -v "$ROOT/_legacy/fonts:/game-fonts:ro" "$IMAGE" "$@"
    ;;
esac
