#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Prints de referência do cliente original (oráculo, tools/parity): para cada mapa grava um replay
# com bots e o reproduz com cada tema, mostrando o mapa inteiro e uma sala.
# Saída: tools/parity/out/og061-ref/MAPA-TEMA-{mapa,sala}.png (fora do git).
set -euo pipefail
cd "$(dirname "$0")/../.."
O=tools/parity/out; mkdir -p $O/og061-ref
for spec in "coliseu 3" "6_askelta 4" "sisso 4" "arena 3" "outgun1 6"; do
  set -- $spec; map=$1; size=$2
  rm -rf $O/server
  bash tools/parity/oracle.sh server --map "$map" --bots 2 --seconds 12 --bottest > /dev/null 2>&1
  R=$(ls -S $O/server/replay | head -1)
  cp "$O/server/replay/$R" "$O/og061-ref/$map.replay"
  for theme in "<no theme>" Ice Grass; do
    t=$(echo "$theme" | tr -d '<> ' ); [ "$t" = notheme ] && t=default
    rm -rf $O/screens
    bash tools/parity/oracle.sh replay "/out/og061-ref/$map.replay" --shots 1 --interval 4 --cfg "64 $size" --cfg "13 $theme" --prefix x > /dev/null 2>&1
    cp $O/screens/x-01.png "$O/og061-ref/$map-$t-mapa.png"
    rm -rf $O/screens
    bash tools/parity/oracle.sh replay "/out/og061-ref/$map.replay" --shots 1 --interval 4 --cfg "64 1" --cfg "13 $theme" --prefix x > /dev/null 2>&1
    cp $O/screens/x-01.png "$O/og061-ref/$map-$t-sala.png"
    echo "$map $t ok"
  done
done
echo DONE
