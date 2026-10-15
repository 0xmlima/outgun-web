# OG-259 — Clã x clã: detecção e marcos

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S17 |
| Status | Backlog |
| Dependências | [OG-250](OG-250-formatos-series-ranked.md) |
| Regras de negócio | RN-RKL-14, RN-SOC-03 |
| Skills | `outgun-card-workflow` |

## História
Como membro de um clã, quero que um jogo entre clãs seja reconhecido e me renda marcos, para registrar as guerras de clãs.

## Contexto
- Marcos: `packages/content/src/milestones.ts` e `apps/api/src/milestones.ts` (OG-213).

## Escopo
- Partida Ranked é **clã x clã** quando todos de um lado têm a mesma clan tag, todos do outro têm outra clan tag, e os dois lados estão completos (ex.: nn x BC).
- Gravar a marcação (e as duas tags) na partida/série; selo "Clã x clã" no relatório e na lista de salas/partidas.
- Marcos novos (lista a validar com o PO): 1ª guerra de clãs, 1ª vitória em guerra de clãs, 10 vitórias, série de guerra de clãs vencida; cálculo retroativo segue o OG-213.

## Critérios de aceite
- [ ] Testes: 3 "nn" x 3 "BC" é clã x clã; 2 "nn" + 1 sem tag x 3 "BC" não é; "nn" x "nn" não é.
- [ ] Marcos concedidos na transação da partida e pelo script retroativo.

## Notas técnicas
- A tag vale como estava no momento da partida (gravar a tag em `match_players`).

## Notas de implementação
(preenchido durante a execução)
