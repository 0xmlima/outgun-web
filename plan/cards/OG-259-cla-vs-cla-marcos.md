# OG-259 — Clã x clã: detecção e marcos

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S19 |
| Status | Backlog |
| Dependências | [OG-250](OG-250-formatos-series-ranked.md), [OG-270](OG-270-clas-cadastro-api.md) |
| Regras de negócio | RN-RKL-14, RN-SOC-03 |
| Skills | `outgun-card-workflow` |

## História
Como membro de um clã, quero que um jogo entre clãs seja reconhecido e me renda marcos, para registrar as guerras de clãs.

## Contexto
- Marcos: `packages/content/src/milestones.ts` e `apps/api/src/milestones.ts` (OG-213).

## Escopo
- Partida Ranked é **clã x clã** quando todos de um lado são do mesmo clã cadastrado (OG-270), todos do outro são de outro clã, e os dois lados estão completos (ex.: nn x BC). Bot substituto conta como do clã do jogador que ele substitui.
- Gravar a marcação (e os dois clãs) na partida/série; selo "Clã x clã" no relatório e na lista de salas/partidas.
- Marcos novos (lista validada pelo PO em 2026-10-15): Guerra de clãs, Primeira conquista, Veterano de guerra (10 partidas), Senhor da guerra (10 vitórias), Série conquistada, Varrida, Rivalidade (5 contra o mesmo clã), Defensor do clã; cálculo retroativo segue o OG-213.

## Critérios de aceite
- [ ] Testes: 3 "nn" x 3 "BC" é clã x clã; 2 "nn" + 1 sem tag x 3 "BC" não é; "nn" x "nn" não é.
- [ ] Marcos concedidos na transação da partida e pelo script retroativo.

## Notas técnicas
- Vale o clã do momento da partida (`clan_id` em `match_players`, OG-273).

## Notas de implementação
(preenchido durante a execução)
