# OG-308 — Banco com menor privilégio: papel da aplicação sem superusuário

| Campo | Valor |
|---|---|
| Épico | E14 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S29 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como operador, quero que a API use um usuário do banco que só lê e grava dados, para que uma falha na aplicação não vire controle total do banco.

## Contexto
Auditoria de segurança de 2026-10-16 (`plan/reports/S29-auditoria-seguranca.md`), guiada pelo OWASP Cheat Sheet Series: Database Security, SQL Injection Prevention, Query Parameterization.

Achado: a API usa o usuário `outgun`, que é **SUPERUSER** (pode criar papéis, bancos e até executar comandos no container via `COPY ... PROGRAM`). As consultas são parametrizadas (Drizzle), então não há injeção conhecida; isto é defesa em profundidade. Redis sem senha (só na rede interna).

## Escopo
- Papel `outgun_migrate` (dono do schema, usado só pelo container `migrate`) e `outgun_app` (SELECT/INSERT/UPDATE/DELETE e uso de sequências; sem DDL) usado pela API.
- `REVOKE CREATE ON SCHEMA public FROM PUBLIC`; superusuário só para manutenção manual.
- Migration ou script idempotente que cria os papéis em instalações novas e existentes.
- Redis com `requirepass` (senha no `.env`).

## Critérios de aceite
- [ ] API rodando com `outgun_app`; tentativa de DDL pela API falha.
- [ ] Migrations rodam com `outgun_migrate`.
- [ ] Redis exige senha; API e game server conectam.

## Notas técnicas
## Notas de implementação
