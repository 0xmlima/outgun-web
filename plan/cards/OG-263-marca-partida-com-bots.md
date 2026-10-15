# OG-263 — Marca "concluída com bots" em partidas Ranked

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S20 |
| Status | Pronto |
| Dependências | [OG-262](OG-262-voto-bot-substituto.md) |
| Regras de negócio | RN-RKL-20 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero saber quais partidas Ranked terminaram com bots, para ler os números delas com esse contexto.

## Escopo
- Gravar na partida quantos bots substitutos entraram e quando; também quantos jogadores ficaram a menos.
- Selo "Concluída com bots" (e "Com um a menos") no relatório, nas partidas recentes do perfil e na página da série.
- A partida **conta para o ranking** normalmente, com a marca (D-46); o bot não ganha pontos (sem conta) e kills em bots não contam para marcos (OG-213).

## Critérios de aceite
- [ ] Partida com bot substituto mostra o selo nas três telas; partida normal não mostra.
- [ ] Testes da gravação e do filtro.

## Notas de implementação
(preenchido durante a execução)
