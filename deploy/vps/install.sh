#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Instala ou atualiza o Outgun Web numa VPS Ubuntu/Debian (OG-109). Roda no servidor, como root, em
# /opt/outgun, depois que deploy.sh copiou os arquivos e carregou as imagens. Idempotente:
#   TAG=<versão> bash /opt/outgun/install.sh
# Na primeira vez instala Docker, firewall (22/80/443), swap e gera /opt/outgun/.env com os segredos;
# DOMAIN padrão: <ip>.sslip.io (HTTPS funciona sem domínio próprio).
set -euo pipefail
cd /opt/outgun
: "${TAG:?defina TAG}"

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -yq docker.io docker-compose-v2 ufw unattended-upgrades
  systemctl enable --now docker
fi
if ! ufw status | grep -q "Status: active"; then
  ufw default deny incoming && ufw default allow outgoing
  ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
  ufw --force enable
fi
if ! swapon --show | grep -q /swapfile && [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

secret() { head -c 24 /dev/urandom | base64 | tr -d '/+=' ; }
if [ ! -f .env ]; then
  ip=$(curl -fsS4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
  gs=$(secret)
  {
    echo "DOMAIN=${DOMAIN:-${ip//./-}.sslip.io}"
    echo "ACME_EMAIL=${ACME_EMAIL:-}"
    echo "POSTGRES_PASSWORD=$(secret)"
    echo "TICKET_SIGNING_KEYS=$(docker run --rm "outgun-api:$TAG" node dist/cli.js ticket-key)"
    echo "INTERNAL_SECRETS=vps:$gs"
    echo "GS_SECRET=$gs"
    echo "METRICS_TOKEN=$(secret)"
    echo "MAILER=log"
  } > .env
  chmod 600 .env
  echo "segredos gerados em /opt/outgun/.env"
fi
# a versão fica no .env: `docker compose` sem argumentos usa a instalada
if grep -q '^TAG=' .env; then sed -i "s/^TAG=.*/TAG=$TAG/" .env; else echo "TAG=$TAG" >> .env; fi
mkdir -p backups

# atualização: o game server recebe SIGTERM e drena (as partidas terminam) antes de trocar
docker compose up -d --remove-orphans --wait edge postgres redis api game-server web backup
docker image prune -f >/dev/null
docker compose ps --format '{{.Service}}: {{.Status}}'
echo "no ar: https://$(grep '^DOMAIN=' .env | cut -d= -f2)"
