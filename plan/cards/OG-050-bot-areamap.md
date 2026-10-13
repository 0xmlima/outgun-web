# OG-050 — Bots: AreaMap e tabelas de distância

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S10 |
| Status | Em revisão |
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
- [x] Para `outgun1` e mais 2 mapas, áreas, vizinhos/portas e distâncias idênticos ao original (dump do oráculo comparado em teste).
- [x] `identifyArea` devolve a mesma área do original para pontos amostrados.

## Notas técnicas
- Parte da quebra do [OG-048](OG-048-bots.md) (refinamento da S10).

## Notas de implementação
- Spec: [plan/specs/bots-areamap.md](../specs/bots-areamap.md). Decisão D-29 (AreaMap compartilhado, distâncias por bot).
- Pacote novo **`packages/bots`** (`@outgun/bots`), puro como a sim (mesmas regras de lint; os testes leem arquivos): `areamap.ts` (divisão das salas, `AreaSplitter`, portas, respawn, `identifyArea`), `distance.ts` (`buildDistanceTable` com o heap da libstdc++ reproduzido — a ordem entre empates muda as distâncias — e `DistanceTables` com o descritor centro/peso), `shared.ts` (cache por CRC e título, `acquireAreaMap`/`releaseAreaMap`).
- Referência do original: fixture `tools/parity/fixtures/areamap.cpp` (lê a árvore privada via `bot_support_open.h`, cópia do cabeçalho com `public:`) → `packages/bots/src/__fixtures__/areamap.json.gz`. Cobre **46 mapas** (todos de `maps/` e `cmaps/` + o sintético `tools/parity/fixtures/areamap-maps/split-rooms.txt`, que exercita salas com até 6 áreas, bolsão cancelado, sala toda parede, áreas em L, portas múltiplas e respawn em salas divididas); amostras de `identifyArea` e tabelas de distância (cada área de partida × peso 0/1 × time) em `outgun1`, `ksii` e no sintético.
- Resultado: tudo idêntico ao original; só `respawnValue` difere em 1 ulp num caso (`-ffast-math`), comparado com 12 dígitos.
- Custo: AreaMap de `outgun1` ≈ 16 ms (uma vez por mapa, compartilhado); tabela de distância ≈ 3 µs.
