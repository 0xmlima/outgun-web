# OG-306 — Servidor: SSH endurecido, atualizações e superfície mínima

| Campo | Valor |
|---|---|
| Épico | E14 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S29 |
| Status | Pronto |
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
- [ ] `sshd -T` com as opções novas; fail2ban ativo e banindo.
- [ ] Só 22/80/443 ouvindo para fora; sem `rpcbind`.
- [ ] Sistema atualizado, sem reinício pendente; reinício automático configurado.

## Notas técnicas
## Notas de implementação
