# OG-453 — Métricas do banco: pg_stat_statements e exporter do Postgres

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S48 |
| Status | Pronto |
| Dependências | OG-452 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero ver as conexões, as queries mais lentas, os locks e o tamanho do banco, para saber se o Postgres é o gargalo quando o jogo fica lento.

## Escopo
- Postgres do beta carrega `pg_stat_statements` (`shared_preload_libraries`); migração nova cria a extensão.
- Papel `outgun_monitor` só com `pg_monitor` (menor privilégio, como o OG-308), criado pelo `migrate up` quando houver `MONITOR_DB_PASSWORD`; o `install.sh` gera a senha.
- O Alloy (OG-452) roda o exporter do Postgres embutido, com as estatísticas de queries ligadas e limitadas para não estourar as séries.

## Critérios de aceite
- [ ] `pg_stat_statements` ativo no beta depois do deploy.
- [ ] O papel de monitoramento não lê as tabelas do jogo (só as visões de estatística).
- [ ] Conexões, transações, locks, tamanho do banco e as queries mais caras chegam ao Grafana Cloud.

## Notas de implementação
