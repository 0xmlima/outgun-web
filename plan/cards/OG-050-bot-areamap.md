# OG-050 — Bots: AreaMap e tabelas de distância

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S10 |
| Status | Pronto |
| Dependências | [OG-042](OG-042-snapshots-aoi.md) |
| Regras de negócio | RN-BOT-02 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como bot, quero um grafo de áreas do mapa com distâncias, para planejar rotas como o original.

## Contexto e referências no original
- `src/bot_support.h`, `src/bot_support.cpp` (AreaMap, RoomAreaMap, SplitByX/Y, AreaSplitter, BotSharedDataStorage).
- `src/robot.cpp:976-1032` (`BuildMap`, `BuildDistanceTable`, peso de respawn `myRespawnWeight` em 1341).

## Escopo
- Port puro em `packages/sim` (ou pacote `bots` sem Node/DOM) da divisão de salas em áreas, vizinhos/portas e tabelas de distância.
- Cache compartilhado por mapa (equivalente a `BotSharedDataStorage`).

## Critérios de aceite
- [ ] Para `outgun1` e mais 2 mapas, áreas, vizinhos/portas e distâncias idênticos ao original (dump do oráculo comparado em teste).
- [ ] `identifyArea` devolve a mesma área do original para pontos amostrados.

## Notas técnicas
- Parte da quebra do [OG-048](OG-048-bots.md) (refinamento da S10).

## Notas de implementação
(preenchido durante a execução)
