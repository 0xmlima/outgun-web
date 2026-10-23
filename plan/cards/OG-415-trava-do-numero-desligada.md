# OG-415 — Trava da troca de número desligada

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S43 (2.43.1) |
| Status | Concluído |
| Dependências | OG-410 |
| Regras de negócio | RN-NUM-01, D-79 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero poder trocar de número quando quiser, para não ficar preso a um número que escolhi só para ver como ficava.

## Contexto
- Achado do PO em 2026-10-24, logo depois da 2.43.0: jogadores clicaram num número para ver e o jogo salvou, com a trava de 30 dias valendo.

## Escopo
- Espera entre trocas em `NUMBER_COOLDOWN_DAYS` (padrão 0 = sem espera); a liberação depois de 60 dias sem jogar continua. Texto da Conta sem os 30 dias.

## Critérios de aceite
- [x] Troca de número sem espera por padrão; com `NUMBER_COOLDOWN_DAYS=30`, a trava volta (teste).

## Notas de implementação
- `numberCooldownMs()` em `apps/api/src/player-numbers.ts` lê o ambiente a cada chamada: religar a trava é só pôr a variável no `.env` do beta e reiniciar a API.
