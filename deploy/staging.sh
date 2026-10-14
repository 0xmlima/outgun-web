#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Homologação local com as imagens de produção (OG-103).
#   bash deploy/staging.sh build   constrói as imagens outgun-{api,game-server,web}:dev
#   bash deploy/staging.sh up      sobe tudo (gera deploy/.env.staging com segredos na primeira vez)
#   bash deploy/staging.sh down    derruba e apaga o banco
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
secret() { head -c 24 /dev/urandom | base64 | tr -d '/+=' ; }
case "${1:-}" in
  build)
    for t in api game-server web; do docker build -q -f Dockerfile --target "$t" -t "outgun-$t:dev" .. >/dev/null; echo "outgun-$t:dev"; done ;;
  up)
    if [ ! -f .env.staging ]; then
      gs=$(secret)
      {
        echo "TICKET_SIGNING_KEYS=$(docker run --rm outgun-api:dev node dist/cli.js ticket-key)"
        echo "INTERNAL_SECRETS=staging-gs:$gs"
        echo "GS_ID=staging-gs"
        echo "GS_SECRET=$gs"
        echo "METRICS_TOKEN=$(secret)"
      } > .env.staging
      echo "segredos em deploy/.env.staging"
    fi
    docker compose up -d --wait api-1 api-2 game-server web
    docker compose ps --format '{{.Service}} {{.Status}}' ;;
  down)
    docker compose down -v ;;
  *)
    echo "uso: staging.sh build|up|down" >&2; exit 2 ;;
esac
