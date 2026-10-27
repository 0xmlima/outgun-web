#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Envio à Steam junto do deploy do beta (pedido do PO, 2026-10-27): espera o workflow "Cliente
# desktop" do commit atual (toda versão nova muda apps/desktop/package.json, então o push já o
# dispara; se não houver execução, dispara à mão) e manda as pastas para a branch "beta" com o
# upload.sh. Chamado no fim do deploy/vps/deploy.sh; também roda sozinho:
#
#   bash apps/desktop/steam/release.sh
#
# Conta do Steamworks: STEAM_USER ou `git config outgun.steamUser <conta>` (fica fora do repositório).
# SKIP_STEAM=1 pula. Falha aqui não desfaz o deploy do servidor: o envio pode ser repetido depois.
set -euo pipefail
cd "$(dirname "$0")/../../.."

[ "${SKIP_STEAM:-}" = 1 ] && { echo "== steam: pulado (SKIP_STEAM=1)"; exit 0; }
user="${STEAM_USER:-$(git config --get outgun.steamUser || true)}"
[ -n "$user" ] || { echo "== steam: sem conta (STEAM_USER ou git config outgun.steamUser); envio pulado" >&2; exit 1; }
sha="$(git rev-parse HEAD)"
git branch -r --contains "$sha" | grep -q . || { echo "== steam: commit ${sha:0:7} não está no GitHub (faça o push antes)" >&2; exit 1; }

run_of() { gh run list --workflow desktop.yml --commit "$sha" --event push --limit 1 --json databaseId -q '.[0].databaseId // empty'; }
run="$(run_of)"
if [ -z "$run" ]; then
  echo "== steam: nenhum build do app em ${sha:0:7}; disparando o workflow"
  gh workflow run desktop.yml --ref "$(git branch --show-current)"
  for _ in $(seq 30); do
    sleep 5
    run="$(gh run list --workflow desktop.yml --commit "$sha" --event workflow_dispatch --limit 1 --json databaseId -q '.[0].databaseId // empty')"
    [ -n "$run" ] && break
  done
  [ -n "$run" ] || { echo "== steam: o workflow não começou" >&2; exit 1; }
fi

echo "== steam: esperando o build do app (run $run)"
gh run watch "$run" --exit-status --interval 30 >/dev/null || { echo "== steam: o build do app falhou (gh run view $run)" >&2; exit 1; }
STEAM_USER="$user" bash apps/desktop/steam/upload.sh "$run" </dev/null
echo "== steam: build na branch beta; para todos, Set build live na default pelo Steamworks"
