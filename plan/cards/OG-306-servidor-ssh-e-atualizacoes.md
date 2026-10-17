# OG-306 — Servidor: SSH endurecido, atualizações e superfície mínima

| Campo | Valor |
|---|---|
| Épico | E14 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S29 |
| Status | Em andamento |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como operador, quero o servidor com o mínimo de portas e serviços e sempre atualizado, para reduzir a chance de invasão.

## Contexto
Auditoria de segurança de 2026-10-16 (`plan/reports/S29-auditoria-seguranca.md`), guiada pelo OWASP Cheat Sheet Series: Attack Surface Analysis, Vulnerable Dependency Management, Network Segmentation.

Achados: 1.153 tentativas de login SSH nas últimas 24 h sem bloqueio (sem fail2ban); `root` entra por chave; `X11Forwarding yes`; `rpcbind` ouvindo na 111 (bloqueado pelo firewall, mas desnecessário); 21 pacotes para atualizar e **reinício pendente** (kernel novo); atualizações automáticas ligadas, mas sem reinício programado.

## Escopo
- SSH: `MaxAuthTries 3`, `X11Forwarding no`, `LoginGraceTime 20`, `AllowUsers root ubuntu` (o deploy segue com root por chave; senha continua desligada).
- `fail2ban` (ou `sshguard`) para o SSH.
- Remover `rpcbind` e outros serviços sem uso.
- Aplicar as 21 atualizações e reiniciar numa janela combinada com o PO (o game server drena as partidas).
- `unattended-upgrades` com reinício automático às 05:00 (BRT) quando o kernel pedir.
- Procedimento no `deploy/vps/README.md`.

## Critérios de aceite
- [x] `sshd -T` com as opções novas; fail2ban ativo e banindo.
- [x] Só 22/80/443 ouvindo para fora; sem `rpcbind`.
- [ ] Sistema atualizado, sem reinício pendente; reinício automático configurado.

## Notas técnicas
## Notas de implementação
- SSH endurecido (`sshd -t`, conexão nova testada antes de fechar a sessão); fail2ban com `backend = systemd` e `journalmatch` de `ssh.service` (o padrão do Ubuntu 24.04 não enxergava as tentativas; corrigido e conferido contando falhas); `rpcbind` desligado e mascarado.
- 18 das 21 atualizações aplicadas sem reiniciar (nenhuma mexia no Docker; jogo no ar o tempo todo); as 3 restantes (apparmor, snapd) estão em liberação gradual e entram sozinhas. Reinício pendente (kernel 7.0.0-1013) fica para o reinício automático das 05:00 de Brasília, para não derrubar partidas à noite.
- Pendente: conferir depois do reinício automático (sem `reboot-required`, containers de pé).
