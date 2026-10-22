# OG-381 — Registro de eventos também nas partidas Casual

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S40 |
| Status | Bloqueado |
| Dependências | OG-362 |
| Regras de negócio | D-75 |
| Skills | `outgun-card-workflow` |

> Bloqueado por: D-75 — decisão do PO sobre gravar os eventos no Casual.

## História
Como jogador do Casual, quero ver multi-kill, trocas, primeiro abate e quem matou quem no relatório, como no Ranqueado.

## Contexto
- Achado do PO em 2026-10-22: os marcadores novos não aparecem nos relatórios do Casual. O registro de eventos (OG-362) foi feito só para as ranqueadas: a última Casual do beta tem 0 eventos.

## Escopo
- O game server grava os eventos das partidas Casual concluídas (sem bots? com bots marcados), com a mesma retenção.
- O relatório mostra os blocos de eventos também no Casual.
- O leaderboard continua só com ranqueadas (RN-LDB-01).

## Critérios de aceite
- [ ] Casual concluída tem eventos e o relatório mostra multi-kill, troca, primeiro abate e quem matou quem.
- [ ] Leaderboard e hall da fama não mudam.

## Notas de implementação
(preenchido durante a execução)
