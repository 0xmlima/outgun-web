# OG-349 — Rating interno de habilidade para o matchmaking

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Could |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-342 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero partidas equilibradas, para que o matchmaking junte gente de nível parecido.

## Contexto
- Mencionado pelo PO (2026-10-21) como futuro: um rating interno, separado do público (score/neg), para medir habilidade.

## Escopo
- Rating escondido por jogador e formato (ex.: Glicko-2 ou TrueSkill por time), atualizado a cada ranqueada concluída; histórico guardado. Não aparece para o jogador nesta etapa.
- Base para um card futuro de matchmaking/balanceamento de lados.

## Critérios de aceite
- [ ] Decisão D-NN com o método escolhido.
- [ ] Recalcular a partir das partidas já guardadas.

## Notas de implementação
