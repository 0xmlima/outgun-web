# OG-109 — Deploy em máquina única (VPS de qualquer provedor)

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S12 |
| Status | Pronto |
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
- [ ] Uma VM Linux limpa (testada localmente com uma VM/contêiner que simule a VPS) fica com o jogo no ar por HTTPS com um comando, e o E2E passa contra ela.
- [ ] Atualização sem perder dados e com drenagem das salas; restore do backup testado.
- [ ] Nenhuma porta além de 22/80/443 exposta; segredos fora do repositório.

## Notas técnicas
- O game server precisa anunciar `wss://<domínio>/...` (PUBLIC_WS_URL) atrás do Caddy; conferir CSP `connect-src` e `TRUST_PROXY`.
- Nada é publicado neste card: a VPS de verdade entra no OG-105, com autorização do PO.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
