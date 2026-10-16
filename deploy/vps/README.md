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
