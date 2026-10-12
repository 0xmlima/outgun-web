# OG-064 — Predição, reconciliação e interpolação

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | S7 |
| Status | Pronto |
| Dependências | [OG-042](OG-042-snapshots-aoi.md), [OG-043](OG-043-client-input.md) |
| Regras de negócio | — |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero que minha nave responda imediatamente aos comandos mesmo com 100 ms de latência.

## Contexto e referências no original
- `ClientWorld::extrapolate`, `extrapolateSinglePlayerPosition` (`world.cpp:3697-3750`).
- `ClientBase::process_live_frame_data` (`clientbase.cpp:419`): histórico de 256 controles, `averageLag`, ajuste de offset de envio.
- Opção de "aumentar lag" (handicap) do original.

## Escopo
- Predição do próprio jogador com `packages/sim` e reconciliação com o snapshot.
- Interpolação de entidades remotas (render a 60+ fps entre frames de 10 Hz).
- Sincronização de relógio e ajuste de envio.
- Handicap de lag opcional.

## Critérios de aceite
- [ ] Com 150 ms de RTT e 2% de perda (simulados), sem "teleportes" perceptíveis em movimento normal.
- [ ] Correções de predição < 1 por segundo em média em teste automatizado.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
