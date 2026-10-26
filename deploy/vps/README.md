# Outgun Web numa VPS (OG-109)

Uma máquina Linux (Ubuntu/Debian, x86_64 ou arm64) com Docker roda tudo: PostgreSQL, Redis, API,
game server, cliente web e um Caddy na frente com HTTPS automático (Let's Encrypt). Serve para o beta
e para qualquer provedor (DigitalOcean, Oracle Cloud com a Ampere A1 grátis, VPS brasileira etc.).

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

## Manutenção e endurecimento do servidor (OG-306)

Feito uma vez à mão no servidor (o `install.sh` não mexe nisso):

- **SSH** (`/etc/ssh/sshd_config.d/10-outgun-hardening.conf`): só chave, `root` e `ubuntu`, 3 tentativas,
  sem X11 nem encaminhamento de portas. Antes de mudar, `sshd -t`; depois de `systemctl reload ssh`, abra
  uma conexão nova antes de fechar a atual.
- **fail2ban** (`/etc/fail2ban/jail.d/outgun.local`): bane por 1 h (crescendo até 1 semana) quem erra 5
  vezes em 10 min. No Ubuntu 24.04 o serviço é `ssh.service` (o padrão do fail2ban procura
  `sshd.service` e não vê nada). Ver: `fail2ban-client status sshd`; desbanir: `fail2ban-client set sshd unbanip IP`.
- **Atualizações** automáticas todo dia; se o kernel pedir, o servidor reinicia às 08:00 UTC (05:00 em
  Brasília) e os containers voltam sozinhos (`/etc/apt/apt.conf.d/52outgun-reboot`).
- **Serviços desligados**: `rpcbind` (mascarado). Para fora só ficam 22, 80 e 443.

## Trocar de domínio (OG-304)

O `DOMAIN` só é escolhido na primeira instalação; depois, troque no `/opt/outgun/.env` e rode o
deploy de novo. `DOMAIN_ALIASES` (separados por espaço) recebe os nomes que devem redirecionar para
o principal, cada um com certificado próprio:

```sh
DOMAIN=outgunweb.com.br
DOMAIN_ALIASES=www.outgunweb.com.br 137-131-202-138.sslip.io
```

Com a Cloudflare: registros A apontando para o IP em "Somente DNS" (nuvem cinza) até o Caddy emitir
os certificados (Let's Encrypt, desafio HTTP na porta 80); depois, se quiser o proxy (nuvem laranja),
use o modo SSL/TLS **Completo (Estrito)**. O modo Flexível entra em loop (o Caddy redireciona HTTP
para HTTPS) e deixaria as senhas sem criptografia entre a Cloudflare e o servidor. Quem jogava pelo
endereço antigo precisa entrar de novo no novo (sessão e opções do navegador são por endereço).

## Ajustes no servidor (`/opt/outgun/.env`, depois `docker compose up -d`)

- `ROTATION` (mapas da rotação, separados por vírgula), `GAMEMOD` (linhas de gamemod separadas por
  `|`), `CASUAL_BOTS_FILL`, `MAX_ROOMS`, `MAX_PLAYERS` — ou pelo painel admin (`/admin`).
- `MAILER=resend` + `RESEND_API_KEY` + `MAIL_FROM` para mandar os e-mails (boas-vindas e recuperação
  de senha; o padrão `log` só registra no log). Sem domínio verificado no Resend, use
  `MAIL_FROM=onboarding@resend.dev` (o Resend só entrega para o e-mail dono da conta). Reenviar as
  boas-vindas: `docker compose exec -T api node dist/cli.js welcome NOME`.
- `SENTRY_DSN` para o envio de erros.
- `GITHUB_ISSUES_TOKEN` para o painel abrir issues dos relatos de bug do site (OG-430): token
  *fine-grained* do GitHub com acesso só ao repositório `thiagovasconcellos/outgun-web` e a permissão
  **Issues: Read and write** (validade de até 1 ano; renovar antes de vencer). `GITHUB_ISSUES_REPO`
  troca o repositório (padrão `thiagovasconcellos/outgun-web`). Sem o token, o botão "Abrir issue" some.

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

Partida que a API recusou (log `API /internal/matches: HTTP 4xx`): corrija a causa e reenvie.
O game server guarda o corpo em `/data/replays/failed/<id>.json` (OG-331); para partidas de
antes disso, reconstrua do replay com `node tools/dev/rebuild-match.mjs` (OG-330). Envio:
`DRY_RUN=1 bash deploy/vps/resend-match.sh root@IP report.json` para conferir, depois sem `DRY_RUN`.

## Logs de segurança e alertas (OG-313)

- **Eventos:** a API registra no log, com o campo `security` (vocabulário da OWASP): `authn_login_success`, `authn_login_fail`, `authn_login_lock`, `authn_password_reset_request`, `authn_password_change`, `user_updated` (troca de nome), `user_deleted` e `authz_change` (troca de papel). Vão o nome de usuário e o IP, nunca e-mail nem senha. Ver: `docker compose logs api | grep '"security"'`.
- **Alertas por e-mail** para `ALERT_EMAIL` (no `.env`; vazio = só o log), no máximo um por tipo a cada 6 h: mais de 50 falhas de login em 10 min, disco acima de 80% e backup atrasado (mais de 26 h sem um bom; o container `backup` grava a hora em `backup-status/last-backup`). O vigia da API confere a cada 15 min. Teste: `docker compose exec api node dist/cli.js alert-test` (um e-mail de cada).
- **Site fora do ar** não dá para ver de dentro da máquina: use uma verificação externa grátis (UptimeRobot ou parecido) em `https://DOMAIN/api/health`, com alerta para o mesmo e-mail.
- **Retenção:** log de cada container em `json-file`, 5 arquivos de 20 MB (o mais antigo sai); auditoria da moderação (`admin_actions`) no banco, sem prazo; backups do banco: os 14 últimos (`BACKUP_KEEP`).

## Provedores

- **DigitalOcean** (beta): sem região na América do Sul; Nova York dá ~110–150 ms a partir do
  Brasil. `s-1vcpu-2gb` (US$ 12/mês) sobra para o beta (o jogo usa ~160 MB de RAM; 20 salas cheias
  usam ~25% de um núcleo, `plan/reports/OG-101-carga.md`).
- **VPS em São Paulo** (destino provável da comunidade): mesmo procedimento; latência de ~10–30 ms.
