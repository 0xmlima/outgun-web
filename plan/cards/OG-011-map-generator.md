# OG-011 — Gerador de mapas aleatórios

| Campo | Valor |
|---|---|
| Épico | E1 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S10 |
| Status | Concluído |
| Dependências | [OG-010](OG-010-map-parser.md) |
| Regras de negócio | RN-MAP-06, RN-VOT-04 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como admin de sala, quero mapas aleatórios na rotação, para variar as partidas.

## Contexto e referências no original
- `src/mapgen.cpp`, `src/mapgen.h`, `src/tools/mapgen-main.cpp`.
- Blocos `mapgen/1.txt` a `60.txt`.
- `random_map w h p` no gamemod.

## Escopo
- Port do `MapGenerator::generate` (simetria, passagens pelas bordas, respawn, bandeira verde, assimétrico).
- Saída no mesmo modelo do parser (OG-010).
- Nome do mapa aleatório (`names.cpp`).

## Critérios de aceite
- [x] Com o mesmo seed (`GlibcRand`), o mapa gerado é idêntico ao do `mapgen` original para 20 seeds.
- [x] Mapas gerados são sempre válidos (RN-MAP-05).

## Notas técnicas
- `mapgen.cpp:165/168` usa `RoomCoords(rand() % w, rand() % h)`: o GCC avalia os argumentos da direita para a esquerda, então o primeiro `rand()` é o y (descoberto no OG-025).
- —

## Notas de implementação
- Spec: [plan/specs/mapgen.md](../specs/mapgen.md). `packages/content/src/map/mapgen.ts`: `MapGenerator` (generate, labirinto com simetria, `shift_rooms`, bases, verde, respawn, A*, `save_map`, `draw`) e `generateRandomMap` (as 50 tentativas de `ServerWorld::generate_map`). A saída é o texto de mapa do jogo, lido pelo parser do OG-010.
- Ordem de `rand()` que importa: em `generate_map` os argumentos são avaliados da direita para a esquerda (verde → respawn → bordas); `RoomCoords(rand()%w, rand()%h)` do respawn sorteia o y antes; `int rx = rand()%w, ry = rand()%h` sorteia o x antes (declaradores em ordem). Probabilidades em `float` (`Math.fround`).
- Referência do original: fixture `tools/parity/fixtures/mapgen.cpp` → `packages/content/src/map/__fixtures__/mapgen.json`: **28 mapas idênticos** (20 seeds + 8 casos extremos), inclusive o bloco de `mapgen/` sorteado (na ordem do `readdir` do container). Validade: 1.000 mapas aleatórios de 1×1 a 8×8 passam pelo parser.
- Nome: o original usa o título `<Random>` (o nome finlandês de `names.cpp` está comentado em `server.cpp`); mantido.
- Fora do escopo: pôr `random_map` na rotação da sala exige mandar o mapa gerado aos clientes — card novo **OG-015** (Backlog).
