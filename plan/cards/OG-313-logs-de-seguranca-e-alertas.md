# OG-313 — Logs de eventos de segurança e alertas ao PO

| Campo | Valor |
|---|---|
| Épico | E14 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S42 |
| Status | Concluído |
| Dependências | [OG-307](OG-307-backups-fora-do-servidor.md) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero ser avisado quando o jogo cair ou houver sinais de ataque, para agir antes que os jogadores percebam.

## Contexto
Auditoria de segurança de 2026-10-16 (`plan/reports/S29-auditoria-seguranca.md`), guiada pelo OWASP Cheat Sheet Series: Logging, Logging Vocabulary, Credential Stuffing Prevention, Denial of Service.

Achados: falhas de login, bloqueios por excesso de tentativas, recuperação de senha e mudanças de papel não geram eventos de segurança padronizados; não há alerta de site fora do ar, disco cheio ou backup falhando (a observabilidade da S11 não foi para a VPS).

## Escopo
- Eventos no vocabulário da OWASP (`authn_login_fail`, `authn_login_lock`, `authn_password_change`, `authz_admin`, `user_updated`...), sem senha nem e-mail no log.
- Alertas por e-mail (Resend) para: site fora do ar (verificação externa grátis), disco acima de 80%, backup falhando, pico de falhas de login.
- Retenção dos logs documentada.

## Critérios de aceite
- [x] Eventos aparecem nos logs com o vocabulário.
- [ ] Alerta de teste chega ao e-mail do PO para cada caso.

## Notas técnicas
## Notas de implementação
- `apps/api/src/security.ts`: `securityEvent` (login, bloqueio, senha, troca de nome, exclusão, papel) e `SecurityWatch` (pico de falhas de login, disco > 80%, backup > 26 h; um e-mail por tipo a cada 6 h). `ALERT_EMAIL`; `BACKUP_STATUS_DIR` com `last-backup` gravado pelo `backup.sh` (a API não vê os dumps). `cli.js alert-test` manda um de cada.
- Site fora do ar: verificação externa (UptimeRobot grátis em `/api/health`), conta criada pelo PO. Retenção em `deploy/vps/README.md`.
- Pendente do PO: `ALERT_EMAIL` no `.env` do beta e a conta da verificação externa; depois, `alert-test` para conferir a chegada.
