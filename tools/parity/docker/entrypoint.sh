#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Modos do oráculo do Outgun original. Resultados vão para /out (montado pelo host).
set -euo pipefail

GAME=/outgun
OUT=/out

usage() {
  cat <<'EOF'
Oráculo do Outgun 1.0.3 original. Comandos:

  server [--seconds N] [--bots N] [--time-limit MIN] [--bottest] [--map NOME]... [--set "chave valor"]...
      Sobe o servidor dedicado com bots (sem humanos) por N segundos de relógio (padrão 90) e grava
      logs, estatísticas e replays em /out/server/. O gamemod é o config/gamemod.txt original
      (preset Clássico) com os overrides indicados.
      --bottest ativa o modo de teste de bots do original (opção -bottest, não documentada): frames
      avançam assim que todos os bots reagem (tempo acelerado), o jogo reinicia no frame 100 e o
      replay é mantido mesmo sem humanos. Sem ele, replays sem humanos são descartados pelo servidor.

  replay ARQUIVO [--shots N] [--interval S]
      Reproduz um replay no cliente original sob Xvfb e salva N screenshots PNG em /out/screens/.

  mappic
      Gera a imagem (PCX + PNG) de todos os mapas de maps/ e cmaps/ em /out/mappic/.

  mapgen LARGURA ALTURA
      Roda o gerador de mapas aleatórios original e imprime o resultado.

  compile-commands
      Copia o compile_commands.json do build (para clangd) para /out/.

  shell
      Abre um shell no container.
EOF
}

write_gamemod() {
  # $1: bots, $2: time limit (min), restantes: overrides "chave valor"
  local bots="$1" time_limit="$2"
  shift 2
  {
    cat "$GAME/config/gamemod.original.txt"
    printf '\n; --- overrides do oráculo (tools/parity) ---\n'
    printf 'server_name Outgun oracle\n'
    printf 'private_server 1\n'
    printf 'recording 1\n'
    printf 'min_bots %s\n' "$bots"
    printf 'bots_fill %s\n' "$bots"
    printf 'time_limit %s\n' "$time_limit"
    for line in "$@"; do printf '%s\n' "$line"; done
  } > "$GAME/config/gamemod.txt"
}

cmd_server() {
  local seconds=90 bots=4 time_limit=1
  local overrides=() extra_args=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --seconds) seconds="$2"; shift 2 ;;
      --bots) bots="$2"; shift 2 ;;
      --time-limit) time_limit="$2"; shift 2 ;;
      --bottest) extra_args+=(-bottest); shift ;;
      --map) overrides+=("map $2"); shift 2 ;;
      --set) overrides+=("$2"); shift 2 ;;
      *) echo "opção desconhecida: $1" >&2; exit 2 ;;
    esac
  done
  write_gamemod "$bots" "$time_limit" "${overrides[@]+"${overrides[@]}"}"
  cd "$GAME"
  echo "servidor dedicado por ${seconds}s, ${bots} bots, time_limit ${time_limit} min"
  # SIGINT encerra o servidor de forma limpa (fecha o replay e grava estatísticas).
  timeout --signal=INT --kill-after=15 "$seconds" ./outgun-ded -nowindow -priv -port 25000 "${extra_args[@]+"${extra_args[@]}"}" > "$GAME/log/console.txt" 2>&1 || true
  mkdir -p "$OUT/server"
  cp -r "$GAME/log" "$GAME/replay" "$GAME/server_stats" "$GAME/config/gamemod.txt" "$OUT/server/"
  echo "resultados em /out/server:"
  find "$OUT/server" -type f | sed "s#^$OUT/##" | sort
}

prepare_client() {
  # Pula as telas de primeira execução (seleção de idioma e política de bug report), que esperam teclado.
  [ -e "$GAME/config/language.txt" ] || echo en > "$GAME/config/language.txt"
  grep -q '^autobugreporting' "$GAME/config/maincfg.txt" || echo 'autobugreporting disabled' >> "$GAME/config/maincfg.txt"
}

start_xvfb() {
  Xvfb :99 -screen 0 1024x768x24 -nolisten tcp > /dev/null 2>&1 &
  export DISPLAY=:99
  sleep 2
}

cmd_replay() {
  local file="${1:?informe o arquivo de replay}"
  shift
  local shots=6 interval=5
  while [ $# -gt 0 ]; do
    case "$1" in
      --shots) shots="$2"; shift 2 ;;
      --interval) interval="$2"; shift 2 ;;
      *) echo "opção desconhecida: $1" >&2; exit 2 ;;
    esac
  done
  prepare_client
  start_xvfb
  mkdir -p "$OUT/screens"
  cd "$GAME"
  ./outgun -win -nosound -replay "$file" > "$GAME/log/client-console.txt" 2>&1 &
  local pid=$!
  # Sem rede, o cliente abre um aviso "Getting server list: ... unreachable"; Enter fecha o aviso.
  sleep 2
  xdotool key Return 2> /dev/null || true
  for i in $(seq 1 "$shots"); do
    sleep "$interval"
    xwd -root -silent | convert xwd:- "$OUT/screens/replay-$(printf '%02d' "$i").png"
    echo "screenshot $i"
  done
  kill "$pid" 2> /dev/null || true
  cp "$GAME/log/client-console.txt" "$OUT/screens/" 2> /dev/null || true
}

cmd_mappic() {
  prepare_client
  start_xvfb
  cd "$GAME"
  mkdir -p "$OUT/mappic"
  for dir in maps cmaps; do
    ./outgun -mappic "$dir" "$OUT/mappic/$dir" > /dev/null 2>&1 || true
    for pcx in "$OUT/mappic/$dir"/*.pcx; do
      [ -e "$pcx" ] || continue
      convert "$pcx" "${pcx%.pcx}.png"
    done
  done
  find "$OUT/mappic" -name '*.png' | wc -l | xargs echo "imagens PNG geradas:"
}

cmd_mapgen() {
  cd "$GAME"
  ./mapgen-tool "${1:?largura}" "${2:?altura}"
}

cmd_compile_commands() {
  cp "$GAME/src/compile_commands.json" "$OUT/compile_commands.json"
  echo "compile_commands.json copiado (caminhos do container: /outgun/src)"
}

# Preserva o gamemod original antes de qualquer override.
[ -e "$GAME/config/gamemod.original.txt" ] || cp "$GAME/config/gamemod.txt" "$GAME/config/gamemod.original.txt"

cmd="${1:-help}"
shift || true
case "$cmd" in
  server) cmd_server "$@" ;;
  replay) cmd_replay "$@" ;;
  mappic) cmd_mappic ;;
  mapgen) cmd_mapgen "$@" ;;
  compile-commands) cmd_compile_commands ;;
  shell) exec bash ;;
  help | -h | --help) usage ;;
  *) echo "comando desconhecido: $cmd" >&2; usage; exit 2 ;;
esac
