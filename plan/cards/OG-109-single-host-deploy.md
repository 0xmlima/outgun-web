# OG-109 — Deploy em máquina única (VPS de qualquer provedor)

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S12 |
| Status | Em revisão |
| Dependências | [OG-103](OG-103-infra-deploy.md) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero subir o jogo inteiro numa única VPS barata (DigitalOcean para o beta; depois um provedor brasileiro escolhido pela comunidade), para testar com jogadores selecionados sem depender de uma plataforma específica.

## Contexto e referências no original
- Decisão do PO (2026-10-14): beta controlado num ambiente de testes; a publicação definitiva fica com a comunidade, provavelmente num serviço brasileiro por causa do ping. O deploy tem de ser portável. O Fly.io (D-04, `deploy/fly/`) fica como opção, não como caminho principal.
- Base pronta na S11: `deploy/Dockerfile` (alvos api, game-server, web), `deploy/compose.yml` + `deploy/staging.sh` (homologação local), `deploy/backup/`, `deploy/test/` (rolling restart, restore), `tools/load/drain.mjs`.

## Escopo
- `deploy/vps/`: compose de produção para uma máquina (PostgreSQL, Redis, migrations, API, game server, Caddy na frente com HTTPS automático do Let's Encrypt para o cliente, `/api` e o WebSocket do game server pelo mesmo domínio, em `wss://`).
- Funciona sem domínio próprio (`<ip>.sslip.io`) e com domínio (`DOMAIN=`).
- Script de instalação idempotente para Ubuntu/Debian (Docker, firewall só 22/80/443, usuário sem root, segredos gerados, serviço que sobe no boot) e de atualização (puxa a versão nova, migra, reinicia com drenagem do game server).
- Imagens: construídas na própria VPS ou em um registro (GHCR); x86_64 e ARM64 (Oracle Free/ARM).
- Backup diário do PostgreSQL na própria VPS com retenção (opção de enviar para um bucket S3 compatível); restore documentado e testado.
- Observabilidade opcional (`tools/observability` apontando para a VPS, sem portas públicas).
- Guia em `deploy/vps/README.md`: criar a VPS (DigitalOcean e alternativas brasileiras), instalar, atualizar, restaurar, custos aproximados.

## Critérios de aceite
- [x] Uma VM Linux limpa fica com o jogo no ar por HTTPS com um comando, e o E2E passa contra ela.
- [x] Atualização sem perder dados e com drenagem das salas; restore do backup testado.
- [x] Nenhuma porta além de 22/80/443 exposta; segredos fora do repositório.

## Notas técnicas
- O game server precisa anunciar `wss://<domínio>/...` (PUBLIC_WS_URL) atrás do Caddy; conferir CSP `connect-src` e `TRUST_PROXY`.
- Nada é publicado neste card: a VPS de verdade entra no OG-105, com autorização do PO.

## Notas de implementação
- `deploy/vps/`: `compose.yml` (edge Caddy com HTTPS automático, PostgreSQL, Redis, migrations, API, game server, web, backup diário), `Caddyfile` (`/gs/*` → game server, `/metrics` bloqueado por fora), `install.sh` (no servidor: Docker, ufw 22/80/443, swap, segredos em `/opt/outgun/.env` com permissão 600, sobe tudo) e `deploy.sh` (aqui: constrói as imagens, envia por SSH com `docker save | ssh docker load`, sem registro, e instala/atualiza). Guia em `deploy/vps/README.md`.
- O game server fica atrás do mesmo domínio em `/gs` (o cliente tem rota `/rooms`, então o prefixo evita conflito); anuncia `wss://DOMÍNIO/gs`. Sem domínio próprio, `IP.sslip.io` recebe certificado do Let's Encrypt normalmente.
- **Beta no ar com autorização do PO (2026-10-14):** droplet `outgun-beta` na DigitalOcean (conta do PO, via `doctl`), `s-1vcpu-2gb` em `nyc1` (o tamanho não estava disponível em `nyc3`), Ubuntu 24.04, chave SSH do Mac. Endereço: https://134-209-116-128.sslip.io. Deploy inicial em 2min40s; atualização em 1min45s.
- Conferido no servidor real: HTTPS válido, API e game server pela borda, CSP com o domínio, `/metrics` dá 404 por fora, firewall só 22/80/443. E2E (3/3, inclusive partida inteira por wss) com regras de teste ligadas temporariamente; atualização de versão pelo `deploy.sh`; backup e restore num PostgreSQL temporário com contagens idênticas. Depois disso as regras de teste foram tiradas e o banco foi zerado (sem contas de teste; sem o seed, que criaria um Admin com senha conhecida).
- Achados: e-mail vazio no `email` global do Caddy quebrava a configuração (removido; o Let's Encrypt não exige); a pasta de backups ficava legível por todos (agora 700).
- Rotação do beta: os 20 mapas da pasta (como o original sem rotação definida), começando por `outgun1`; ajustável pelo painel.
- Pendências: sem o OG-106 qualquer pessoa com o endereço pode se cadastrar e jogar; e-mails de recuperação só no log (`MAILER=log`) até haver chave do Resend.
