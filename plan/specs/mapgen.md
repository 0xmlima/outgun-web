# Spec: gerador de mapas aleatórios
Card(s): OG-011 · RNs: RN-MAP-05, RN-MAP-06, RN-VOT-04

## Resumo
`random_map W H [pelas_bordas respawn respawn_repetido verde s|a]` põe na rotação um mapa gerado na
hora: um labirinto de W×H salas (árvore geradora com simetria), bases o mais longe possível, bandeira
verde opcional, áreas de respawn opcionais e um bloco de paredes sorteado de `mapgen/`.

## Fonte
- `src/gamemod.cpp:87-114` — `GS_RandomMap::set`: defaults 0,2 / 0,1 / 0,5 / 0,1 / `s`; título `<Random>`, autor `Outgun` (o nome finlandês está comentado no original).
- `src/server.cpp:514-524` — `load_rotation_map`: arquivo `maps/generated/mapgen_<rand()>.txt`.
- `src/world.cpp` `ServerWorld::generate_map` — até 50 tentativas até a distância entre bases passar de 1 (ou W ≤ 2 ou H ≤ 2).
- `src/mapgen.cpp:47-187` — `generate`; `188-226` `remove_wall`; `228-284` `shift_rooms*`; `306-428` escolha de bases; `430-498` `distance` (A*); `500-540` `save_map`.

## Algoritmo (pontos que mudam o resultado)
1. **Argumentos de `generate` em `generate_map`**: `rand() % 1000 < 1000 * p` com `p` em `float`, avaliados **da direita para a esquerda**: primeiro a verde, depois o respawn, por último "pelas bordas".
2. Simetria: com verde, W par → vertical; H par → horizontal; senão `rand()%5==0` rotacional, ou `rand()%2` horizontal/vertical. Sem verde: `rand()%4 ≠ 0` → rotacional; senão `rand()%3+1` até ser compatível com mapas de 1 sala de altura/largura. Verde impossível de ficar simétrica (W e H pares) é desligada.
3. Labirinto: sala inicial `rx = rand()%W, ry = rand()%H` (declaradores em ordem: x antes de y); remove paredes em direções `rand()%4`, espelhando pela simetria; sala sem vizinhos livres vira "checada" e salta para outra visitada sorteada (x antes de y).
4. `shift_rooms_if_needed`: gira o mapa para começar na primeira linha/coluna com parede inteira.
5. Bases: simétrico — candidatas a ≥ `min(max, max(8·max/10, 3))` da sala espelhada, sorteio uniforme; assimétrico — pares mais distantes. Verde: na linha do centro, à distância máxima; assimétrico — mesma distância das duas bases.
6. Respawn: `RoomCoords(rand()%W, rand()%H)` — **y sorteado antes de x**; repete com probabilidade `respawn_repetido`.
7. `save_map`: `flag_team = rand()%2`, piso comum `rand()%5+1` (3→5, 4→6, 5→7), salas em ordem y, x; bloco de `mapgen/` por amostragem de reservatório (um `rand()` por arquivo, na ordem do `readdir`).

## Divergências intencionais
- Ordem dos blocos de `mapgen/`: no original é a do `readdir` (depende do sistema de arquivos); a web usa a ordem que o servidor passar (alfabética no servidor). O teste usa a ordem gravada no oráculo.
- Comentários do cabeçalho (versão e data) ficam a cargo de quem chama.

## Vetores de teste
`packages/content/src/map/__fixtures__/mapgen.json` (fixture `tools/parity/fixtures/mapgen.cpp`): 28 mapas (seeds 1–20 em tamanhos 2–6 × 1–4, simétricos e assimétricos, e 8 casos extremos: 1×1, 8×8, 5×1, todas as probabilidades em 1, tudo em 0). Texto idêntico ao original, fora os comentários. Validade: 1.000 mapas com parâmetros aleatórios passam pelo parser (RN-MAP-05).
