# OG-310 — Contas dos provedores com MFA, DNS protegido e segredos arrumados

| Campo | Valor |
|---|---|
| Épico | E14 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 1 pts |
| Sprint | S29 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero as contas que controlam o jogo protegidas por segundo fator, para que uma senha vazada não entregue servidor, domínio ou código.

## Contexto
Auditoria de segurança de 2026-10-16 (`plan/reports/S29-auditoria-seguranca.md`), guiada pelo OWASP Cheat Sheet Series: Multifactor Authentication, Secrets Management, Subdomain Takeover Prevention, Key Management.

Quem controla GitHub, Oracle Cloud, Cloudflare, Resend ou o registro do domínio controla o jogo inteiro. Achados no servidor: dois arquivos `.env.bak-*` com segredos sobrando; na máquina do PO, chave SSH da Oracle em `~/Downloads`.

## Escopo
- PO: MFA (app autenticador ou chave física) em GitHub, Oracle Cloud, Cloudflare, Resend e Registro.br; revisar quem tem acesso a cada um.
- DNS: DNSSEC ligado (Cloudflare + Registro.br) e registro CAA só para `letsencrypt.org`; conferir que não há registros apontando para serviços desativados.
- Agente: apagar os `.env.bak-*` do servidor; mover a chave SSH da Oracle para `~/.ssh` com permissão 600; inventário de segredos (onde está cada um e como trocar) no README do deploy.

## Critérios de aceite
- [ ] PO confirma MFA nas cinco contas.
- [ ] DNSSEC e CAA ativos (conferidos com `dig`).
- [ ] Sem cópias de `.env` sobrando; inventário de segredos documentado.

## Notas técnicas
## Notas de implementação
