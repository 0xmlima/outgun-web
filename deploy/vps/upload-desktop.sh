#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Envia o instalador do cliente para Windows (OG-324) ao servidor (OG-325): fica em
# /opt/outgun/downloads e sai em https://<domínio>/download/Outgun-Setup.exe. Guarda também a
# cópia com a versão no nome. Uso: bash deploy/vps/upload-desktop.sh Outgun-Setup-2.32.0.exe root@host
set -euo pipefail
file="${1:?uso: upload-desktop.sh <Outgun-Setup-x.y.z.exe> <usuário@host>}"
host="${2:?uso: upload-desktop.sh <Outgun-Setup-x.y.z.exe> <usuário@host>}"
name="$(basename "$file")"
case "$name" in Outgun-Setup-*.exe) ;; *) echo "esperava Outgun-Setup-<versão>.exe, veio $name" >&2; exit 1 ;; esac
ssh "$host" "mkdir -p /opt/outgun/downloads"
scp -q "$file" "$host:/opt/outgun/downloads/$name.part"
# troca atômica: quem estiver baixando não pega um arquivo pela metade
ssh "$host" "cd /opt/outgun/downloads && mv '$name.part' '$name' && ln -sfn '$name' Outgun-Setup.exe.tmp && mv -T Outgun-Setup.exe.tmp Outgun-Setup.exe && ls -la"
