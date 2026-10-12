# OG-011 — Gerador de mapas aleatórios

| Campo | Valor |
|---|---|
| Épico | E1 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S10 |
| Status | Backlog |
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
- [ ] Com o mesmo seed (`GlibcRand`), o mapa gerado é idêntico ao do `mapgen` original para 20 seeds.
- [ ] Mapas gerados são sempre válidos (RN-MAP-05).

## Notas técnicas
- `mapgen.cpp:165/168` usa `RoomCoords(rand() % w, rand() % h)`: o GCC avalia os argumentos da direita para a esquerda, então o primeiro `rand()` é o y (descoberto no OG-025).
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
