#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Envia o cliente para a Steam (OG-328, D-59): baixa as pastas do app geradas pelo workflow
# "Cliente desktop", extrai e roda o SteamCMD. O build fica só na branch "beta".
#
#   STEAM_USER=<conta> pnpm steam:upload            # última execução com sucesso do workflow
#   STEAM_USER=<conta> pnpm steam:upload <run-id>   # uma execução específica
#
# A conta precisa ter feito login uma vez no SteamCMD (senha + Steam Guard) nesta máquina.
set -euo pipefail

: "${STEAM_USER:?defina STEAM_USER com a conta do Steamworks}"
command -v steamcmd >/dev/null || { echo "instale o SteamCMD: brew install --cask steamcmd" >&2; exit 1; }

here="$(cd "$(dirname "$0")" && pwd)"
run="${1:-$(gh run list --workflow desktop.yml --status success --limit 1 --json databaseId -q '.[0].databaseId')}"
[ -n "$run" ] || { echo "nenhuma execução do workflow desktop.yml com sucesso" >&2; exit 1; }
sha="$(gh run view "$run" --json headSha -q .headSha)"
version="$(node -p "require('$here/../package.json').version")"

work="$here/work"
rm -rf "$work"
mkdir -p "$work/artifacts" "$work/output"
gh run download "$run" -n outgun-steam-win -n outgun-steam-mac -n outgun-steam-linux -D "$work/artifacts"
for target in win mac linux; do
  mkdir -p "$work/content/$target"
  tar -xzf "$work/artifacts/outgun-steam-$target/outgun-steam-$target.tar.gz" -C "$work/content/$target"
done

desc="Outgun $version (${sha:0:7}, run $run)"
echo "enviando: $desc"
steamcmd +login "$STEAM_USER" +run_app_build -desc "$desc" "$here/app_build_663760.vdf" +quit
