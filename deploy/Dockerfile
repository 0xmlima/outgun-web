# syntax=docker/dockerfile:1.7
# SPDX-License-Identifier: GPL-2.0-or-later
# Imagens de produção do Outgun Web (OG-103), a partir da raiz do repositório:
#   docker build -f deploy/Dockerfile --target api .
#   docker build -f deploy/Dockerfile --target game-server .
#   docker build -f deploy/Dockerfile --target web .
# Node 22 em Debian: o uWebSockets.js só tem binários para glibc (ABI 127 no Node 22).

FROM node:22.20.0-bookworm-slim AS base
ENV CI=1 PNPM_HOME=/pnpm
# o corepack do Node 22 não entende o pacote do pnpm 12: instala a versão do packageManager direto
RUN npm install -g pnpm@12.11.2
WORKDIR /repo

# --- build: instala, compila e separa as dependências de produção de cada serviço ---
FROM base AS build
# git: o uWebSockets.js vem do GitHub e o `pnpm deploy` resolve o repositório de novo
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@outgun/api... --filter=@outgun/game-server... --filter=@outgun/web^... --filter=@outgun/asset-pipeline
# assets do jogo original convertidos (fontes, gráficos, sons) para o cliente
RUN node tools/asset-pipeline/dist/cli.js
ARG VITE_SENTRY_DSN=
ARG VITE_RELEASE=
RUN VITE_SENTRY_DSN=$VITE_SENTRY_DSN VITE_RELEASE=$VITE_RELEASE pnpm --filter @outgun/web exec vite build
# cabeçalhos de segurança do cliente para o Caddy, gerados de apps/web/security-headers.ts
RUN node --experimental-strip-types deploy/web/caddy-headers.mjs > /repo/security-headers.caddy
RUN pnpm --filter @outgun/api deploy --prod --legacy /out/api \
 && pnpm --filter @outgun/game-server deploy --prod --legacy /out/game-server \
 && find /out/game-server -name 'uws_*.node' ! -name 'uws_linux_*_127.node' -delete

# --- API ---
FROM node:22.20.0-bookworm-slim AS api
ENV NODE_ENV=production PORT=7800 MIGRATE=0
WORKDIR /app
COPY --from=build --chown=node:node /out/api /app
USER node
EXPOSE 7800
STOPSIGNAL SIGTERM
CMD ["node", "dist/main.js"]

# --- game server ---
FROM node:22.20.0-bookworm-slim AS game-server
ENV NODE_ENV=production PORT=7700 MAPS_DIR=/app/maps REPLAY_DIR=/data/replays
WORKDIR /app
COPY --from=build --chown=node:node /out/game-server /app
COPY --from=build --chown=node:node /repo/maps /app/maps
RUN mkdir -p /data/replays && chown node:node /data/replays
USER node
EXPOSE 7700
STOPSIGNAL SIGTERM
CMD ["node", "dist/main.js"]

# --- cliente web: arquivos estáticos no Caddy, /api repassado para a API ---
FROM caddy:2.10.2-alpine AS web
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/security-headers.caddy /etc/caddy/security-headers.caddy
COPY --from=build /repo/apps/web/dist /srv
EXPOSE 8080
