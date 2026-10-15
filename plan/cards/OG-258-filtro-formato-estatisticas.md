# OG-258 — Filtro por formato (3x3/4x4/5x5) no ranking, perfil e partidas

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S17 |
| Status | Backlog |
| Dependências | [OG-250](OG-250-formatos-series-ranked.md) |
| Regras de negócio | RN-RKL-13, RN-SOC-02 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero filtrar estatísticas e partidas Ranked por formato, para comparar meu desempenho no 3x3, 4x4 e 5x5.

## Escopo
- API: parâmetro `format` nas rotas de perfil, partidas recentes e ranking (D-42).
- Cliente: filtro "Todos / 3x3 / 4x4 / 5x5" no perfil, na lista de partidas e no ranking; filtro guardado na URL.

## Critérios de aceite
- [ ] Partidas sem formato (anteriores ao OG-250) só aparecem em "Todos".
- [ ] Testes das consultas filtradas.

## Notas de implementação
(preenchido durante a execução)
