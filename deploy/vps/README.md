# Outgun Web numa VPS (OG-109)

Uma máquina Linux (Ubuntu/Debian, x86_64) com Docker roda tudo: PostgreSQL, Redis, API, game server,
cliente web e um Caddy na frente com HTTPS automático (Let's Encrypt). Serve para o beta e para
qualquer provedor (DigitalOcean, VPS brasileira etc.).

```
navegador ──HTTPS──▶ edge (Caddy, 80/443) ──▶ web (Caddy: estáticos + /api ──▶ api)
                                        └─ /gs/* ──▶ game-server (WebSocket wss://DOMÍNIO/gs/rooms/...)
api, game-server ──▶ postgres, redis        backup: pg_dump diário em /opt/outgun/backups
```

## Subir ou atualizar

```sh
bash deploy/vps/deploy.sh root@IP            # domínio: IP.sslip.io (HTTPS sem domínio próprio)
DOMAIN=jogo.exemplo.com bash deploy/vps/deploy.sh root@IP   # com domínio (DNS A apontando para o IP)
```

O script constrói as imagens nesta máquina, envia por SSH (sem registro de imagens), copia a
configuração para `/opt/outgun` e roda `install.sh` no servidor. Na primeira vez o `install.sh`
instala Docker, firewall (só 22/80/443), swap de 2 GB e gera `/opt/outgun/.env` com os segredos
(senha do banco, chaves dos tickets, segredo do game server, token das métricas). Rodar de novo
atualiza: o game server drena (as partidas em andamento terminam) antes de trocar de versão.
A versão é o hash do commit (`TAG` no `.env`).

## Ajustes no servidor (`/opt/outgun/.env`, depois `docker compose up -d`)

- `ROTATION` (mapas da rotação, separados por vírgula), `GAMEMOD` (linhas de gamemod separadas por
  `|`), `CASUAL_BOTS_FILL`, `MAX_ROOMS`, `MAX_PLAYERS` — ou pelo painel admin (`/admin`).
- `MAILER=resend` + `RESEND_API_KEY` + `MAIL_FROM` para mandar os e-mails de recuperação de senha
  (o padrão `log` só registra no log).
- `SENTRY_DSN` para o envio de erros.

## Operação

```sh
ssh root@IP
cd /opt/outgun
docker compose ps                        # estado
docker compose logs -f game-server       # logs (JSON)
docker compose exec -T backup sh /usr/local/bin/backup.sh   # backup agora
# beta fechado (BETA=1, padrão): convite para o primeiro cadastro (os outros saem do painel /admin)
docker compose exec -T api node dist/cli.js invite 1 "admin"
# promover uma conta a admin (ou moderator / player) depois que a pessoa se cadastrou:
docker compose exec -T api node dist/cli.js role Nome admin
```

Restore (apaga o banco de destino): confira antes num banco temporário, como em
`deploy/test/backup-restore.sh`; depois
`docker compose stop api game-server && docker compose run --rm -v $PWD/backups:/backup -e RESTORE_CONFIRM=sim -e DATABASE_URL=postgres://outgun:SENHA@postgres:5432/outgun --entrypoint sh backup /usr/local/bin/restore.sh /backup/ARQUIVO.dump && docker compose up -d`.

## Provedores

- **DigitalOcean** (beta): sem região na América do Sul; Nova York dá ~110–150 ms a partir do
  Brasil. `s-1vcpu-2gb` (US$ 12/mês) sobra para o beta (o jogo usa ~160 MB de RAM; 20 salas cheias
  usam ~25% de um núcleo, `plan/reports/OG-101-carga.md`).
- **VPS em São Paulo** (destino provável da comunidade): mesmo procedimento; latência de ~10–30 ms.
