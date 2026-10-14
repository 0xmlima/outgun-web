#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Deploy do Outgun Web numa VPS (OG-109), a partir desta máquina: constrói as imagens, envia por SSH
# (sem registro de imagens), copia a configuração e roda o install.sh no servidor.
#   bash deploy/vps/deploy.sh root@IP
# Precisa de acesso SSH como root (chave) e de uma VPS Ubuntu/Debian x86_64 ou arm64 (as imagens saem
# na arquitetura do servidor; arm64 numa máquina x86 passa por emulação e demora mais).
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v docker >/dev/null || export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
host="${1:?uso: deploy.sh root@IP}"
tag="$(git rev-parse --short HEAD)$(git diff --quiet HEAD -- apps packages deploy || echo -dirty)"
ssh_() { ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "$host" "$@"; }

case "$(ssh_ uname -m)" in
  x86_64) platform=linux/amd64 ;;
  aarch64 | arm64) platform=linux/arm64 ;;
  *) echo "arquitetura do servidor não suportada" >&2; exit 1 ;;
esac

echo "== imagens $tag ($platform)"
# VITE_OPERATOR_CONTACT (opcional): contato do responsável na política de privacidade
for t in api game-server web; do docker build -q --platform "$platform" -f deploy/Dockerfile --target "$t" --build-arg "VITE_RELEASE=$tag" --build-arg "VITE_OPERATOR_CONTACT=${VITE_OPERATOR_CONTACT:-}" -t "outgun-$t:$tag" . >/dev/null; done
docker build -q --platform "$platform" -t "outgun-backup:$tag" deploy/backup >/dev/null

echo "== envio"
ssh_ "mkdir -p /opt/outgun"
missing=""
for t in api game-server web backup; do
  ssh_ "docker image inspect outgun-$t:$tag >/dev/null 2>&1" 2>/dev/null || missing="$missing outgun-$t:$tag"
done
if [ -n "$missing" ]; then
  # shellcheck disable=SC2086
  docker save $missing | gzip -1 | ssh_ "command -v docker >/dev/null || (apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -yq docker.io docker-compose-v2 >/dev/null); gunzip | docker load" | tail -4
fi
scp -q -o StrictHostKeyChecking=accept-new deploy/vps/compose.yml deploy/vps/Caddyfile deploy/vps/install.sh deploy/backup/restore.sh "$host:/opt/outgun/"

echo "== instalação"
ssh_ "TAG=$tag ${DOMAIN:+DOMAIN=$DOMAIN} bash /opt/outgun/install.sh"
