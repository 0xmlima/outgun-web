# OG-314 — Segundo fator (TOTP) para contas admin e moderador

| Campo | Valor |
|---|---|
| Épico | E14 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S30 |
| Status | Backlog |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como admin, quero um segundo fator no login, para que uma senha vazada não dê acesso ao painel de moderação.

## Contexto
Auditoria de segurança de 2026-10-16 (`plan/reports/S29-auditoria-seguranca.md`), guiada pelo OWASP Cheat Sheet Series: Multifactor Authentication, Authentication, Credential Stuffing Prevention.

Contas admin e moderador banem jogadores, mudam presets e rotação. Hoje entram só com senha.

## Escopo
- TOTP (RFC 6238) com códigos de recuperação; obrigatório para admin e moderador, opcional para jogadores.
- Segredo cifrado no banco; limite de tentativas; eventos de segurança.

## Critérios de aceite
- [ ] Admin sem TOTP não acessa o painel.
- [ ] Testes de cadastro, login, recuperação e limite de tentativas.

## Notas técnicas
## Notas de implementação
