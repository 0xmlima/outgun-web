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

# cada pacote que faltar (o deploy.sh já pode ter instalado o Docker; imagens mínimas vêm sem ufw)
pkgs=""
command -v docker >/dev/null && docker compose version >/dev/null 2>&1 || pkgs="docker.io docker-compose-v2"
command -v ufw >/dev/null || pkgs="$pkgs ufw"
dpkg -s unattended-upgrades >/dev/null 2>&1 || pkgs="$pkgs unattended-upgrades"
if [ -n "$pkgs" ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  # shellcheck disable=SC2086
  apt-get install -yq $pkgs
fi
systemctl enable --now docker
# as imagens Ubuntu da Oracle Cloud trazem regras de iptables que rejeitam tudo menos o SSH (e o
# encaminhamento do Docker): sai o netfilter-persistent, quem cuida do firewall é o ufw
if dpkg -s netfilter-persistent >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get purge -yq iptables-persistent netfilter-persistent
  while iptables -D INPUT -j REJECT --reject-with icmp-host-prohibited 2>/dev/null; do :; done
  while iptables -D FORWARD -j REJECT --reject-with icmp-host-prohibited 2>/dev/null; do :; done
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
# senhas do papel da aplicação no Postgres e do Redis (OG-308), também em instalações antigas
grep -q '^APP_DB_PASSWORD=' .env || echo "APP_DB_PASSWORD=$(secret)" >> .env
grep -q '^REDIS_PASSWORD=' .env || echo "REDIS_PASSWORD=$(secret)" >> .env
# papel do Postgres só para as estatísticas (OG-453), usado pelo postgres_exporter
grep -q '^MONITOR_DB_PASSWORD=' .env || echo "MONITOR_DB_PASSWORD=$(secret)" >> .env
# beta fechado (OG-106) ligado por padrão; a publicação aberta põe BETA=0 no .env
grep -q '^BETA=' .env || echo "BETA=1" >> .env
# a versão fica no .env: `docker compose` sem argumentos usa a instalada
if grep -q '^TAG=' .env; then sed -i "s/^TAG=.*/TAG=$TAG/" .env; else echo "TAG=$TAG" >> .env; fi
# versão do jogo (2.NN.x): release dos erros no Sentry (OG-434); sem ela, fica a TAG (o commit)
if [ -n "${RELEASE:-}" ]; then
  if grep -q '^RELEASE=' .env; then sed -i "s/^RELEASE=.*/RELEASE=$RELEASE/" .env; else echo "RELEASE=$RELEASE" >> .env; fi
fi
mkdir -p backups && chmod 700 backups # os dumps têm hashes de senha e e-mails
mkdir -p downloads # instalador do cliente para Windows (OG-325)

# atualização: o game server recebe SIGTERM e drena (as partidas terminam) antes de trocar
services="edge postgres redis api game-server web backup"
# métricas e logs no Grafana Cloud (OG-452, OG-457): só com as credenciais (deploy/vps/grafana-cloud.sh)
grep -q '^GRAFANA_CLOUD_TOKEN=.' .env && services="$services postgres-exporter fluent-bit"
docker compose up -d --remove-orphans --wait $services
# o Caddyfile é montado do disco: sem recarregar, a borda segue com a configuração antiga (OG-311)
docker compose exec -T edge caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || echo "aviso: não recarreguei o Caddyfile da borda"
docker image prune -f >/dev/null
docker compose ps --format '{{.Service}}: {{.Status}}'
echo "no ar: https://$(grep '^DOMAIN=' .env | cut -d= -f2)"
