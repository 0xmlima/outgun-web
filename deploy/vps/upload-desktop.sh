#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Envia os instaladores do cliente desktop (OG-324, OG-326) ao servidor (OG-325): ficam em
# /opt/outgun/downloads, com a versão no nome, e cada sistema ganha um link fixo em
# https://<domínio>/download/ (Outgun-Setup.exe, Outgun-mac.dmg, Outgun-linux.deb).
# Uso: bash deploy/vps/upload-desktop.sh root@host Outgun-Setup-2.32.0.exe Outgun-mac-2.32.0.dmg ...
set -euo pipefail
host="${1:?uso: upload-desktop.sh <usuário@host> <instalador>...}"
shift
[ $# -gt 0 ] || { echo "uso: upload-desktop.sh <usuário@host> <instalador>..." >&2; exit 1; }
ssh "$host" "mkdir -p /opt/outgun/downloads"
for file in "$@"; do
  name="$(basename "$file")"
  case "$name" in
    Outgun-Setup-*.exe) link=Outgun-Setup.exe ;;
    Outgun-mac-*.dmg) link=Outgun-mac.dmg ;;
    Outgun-linux-*.deb) link=Outgun-linux.deb ;;
    *) echo "nome inesperado: $name (Outgun-Setup-<v>.exe, Outgun-mac-<v>.dmg ou Outgun-linux-<v>.deb)" >&2; exit 1 ;;
  esac
  scp -q "$file" "$host:/opt/outgun/downloads/$name.part"
  # troca atômica: quem estiver baixando não pega um arquivo pela metade
  ssh "$host" "cd /opt/outgun/downloads && mv '$name.part' '$name' && ln -sfn '$name' '$link.tmp' && mv -T '$link.tmp' '$link'"
done
ssh "$host" "ls -la /opt/outgun/downloads"
