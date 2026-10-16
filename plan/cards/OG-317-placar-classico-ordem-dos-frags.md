# OG-317 — Placar do HUD Clássico ordenado por frags

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | — |
| Status | Backlog |
| Dependências | — |
| Regras de negócio | RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver a lista de cada time ordenada por frags, para saber quem está na frente sem ler todos os números.

## Contexto
Relato do PO em 2026-10-17 (captura: vermelho 13, 16, 21, 18; azul 18, 18, 11, 22). Causa: `online-hud.ts` ordena os jogadores por `pid` (ordem de entrada). O original reordena a cada atualização de frags com `stable_sort(..., compare_players)` (`src/world.cpp:64`, `src/clientbase.cpp:668`): time vermelho antes do azul, mais frags primeiro e, no empate, a ordem anterior (sem os nomes trocando de lugar a cada quadro).

## Escopo
- Placar da coluna do Clássico ordenado como o original (ordem estável entre quadros nos empates).
- Conferir também o placar do TAB do Moderno (OG-299), que já ordena por frags, para usar a mesma regra.

## Critérios de aceite
- [ ] Lista de cada time do mais para o menos frags; empates sem pular de lugar.
- [ ] Teste da ordenação; `visual:check` do Clássico com a mudança declarada (RN-UI-05: só a ordem muda).

## Notas técnicas
## Notas de implementação
