# OG-308 — Banco com menor privilégio: papel da aplicação sem superusuário

| Campo | Valor |
|---|---|
| Épico | E14 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S29 |
| Status | Em revisão |
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
- [x] API rodando com `outgun_app`; tentativa de DDL pela API falha.
- [x] Migrations rodam com `outgun_migrate`.
- [x] Redis exige senha; API e game server conectam.

## Notas técnicas
## Notas de implementação
- `apps/api/src/db/app-role.ts` (`ensureAppRole`, idempotente): papel `outgun_app` com LOGIN e só SELECT/INSERT/UPDATE/DELETE e uso de sequências, privilégios padrão para as próximas tabelas, sem escrita em `schema_migrations`, `REVOKE CREATE ON SCHEMA public FROM PUBLIC`. Roda no fim do `cli.js migrate up` quando há `APP_DB_PASSWORD`. Variante do escopo: o dono do schema continua o `outgun` (superusuário), usado só pelos containers `migrate` e `backup`; a API nunca mais o usa.
- Compose: API com `outgun_app` e `MIGRATE=0` (o `CREATE TABLE IF NOT EXISTS schema_migrations` do arranque exige permissão de criar); Redis com `--requirepass`. `install.sh` gera `APP_DB_PASSWORD` e `REDIS_PASSWORD` também em instalações existentes.
- Teste no Postgres real (`app-role.test.ts`): lê e grava; recusa CREATE/ALTER/DROP TABLE, CREATE ROLE, escrita nas migrations e `COPY ... TO PROGRAM`; idempotente; troca de senha.
- Em produção desde 2026-10-17 (deploy do branch `s29`, backup antes): API conectada só como `outgun_app`, Redis recusando sem senha, partida de convidado conferida.
