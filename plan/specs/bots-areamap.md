# Spec: bots — AreaMap e tabelas de distância
Card(s): OG-050 · RNs: RN-BOT-02

## Resumo
Os bots enxergam o mapa como um grafo de **áreas**: cada sala é dividida nas regiões conexas por onde
um jogador passa, e as áreas se ligam pelas **portas** nas bordas da sala. Sobre esse grafo o bot
calcula **tabelas de distância** (Dijkstra com rótulo na entrada da fila) para escolher destinos e
rotas. O grafo depende só do mapa e é compartilhado por todos os bots.

## Fonte
- `src/bot_support.h:31-215` — `DistanceTableId`, `AreaMap`, `Area`, `Neighbor`, `RoomAreaMap` (árvore `SingleArea`/`SplitByX`/`SplitByY`), `AreaSplitter`, `BotSharedDataStorage`.
- `src/bot_support.cpp:35-60` — `BotSharedDataStorage::acquire/release`: cache por (CRC, título) com contagem de usuários.
- `src/bot_support.cpp:62-221` — `AreaMap::splitRoom`: grade de pontos, componentes, portas, áreas canceladas, frequência de respawn.
- `src/bot_support.cpp:223-387` — `AreaSplitter`: árvore de cortes que localiza a área de um ponto.
- `src/bot_support.cpp:389-404` — `identifyArea` (sala inválida → primeira área).
- `src/bot_support.cpp:430-488` — `AreaMap::initialize`: ligação das portas e valores de respawn.
- `src/robot.cpp:976-1031` — `Robot::BuildMap` (adquire o AreaMap, zera os descritores) e `BuildDistanceTable`.
- `src/robot.h:61-98` — `roomToRoomBaseDistance = 1000`, `DistanceTableDescriptor`, `DistanceComparison`.
- `src/robot.cpp:1341` — `myRespawnWeight()`: 1 se o bot leva bandeira, senão 0.

## Settings e constantes
| Nome | Valor | Uso |
|---|---|---|
| `xPoints` | 65 | pontos por linha da grade da sala |
| `yPoints` | `(65−1)·plh/plw + 1` = 49 (inteiro) | pontos por coluna |
| `pointDistance` | `plw/64` = 7,375 | distância entre pontos (igual nos dois eixos) |
| `pointRadius` | `√((pointDistance/2)² + (1,1·PLAYER_RADIUS)²)` ≈ 16,907 | ponto livre se `fall_on_wall(ponto, pointRadius)` é falso |
| `bledPart` | 0,5 | parte da frequência de respawn que escorre para os vizinhos |
| `roomToRoomBaseDistance` | 1000 | custo base de entrar numa área |

Nenhum setting do servidor influencia o AreaMap.

## Algoritmo
### Divisão de uma sala (`splitRoom`)
1. Ponto `(ix, iy)` em `(ix·pd, iy·pd)` é **parede** se `room.fall_on_wall(ponto, pointRadius)`; senão "não alcançado".
2. Varre `ix` de 0 a 64 e, dentro, `iy` de 0 a 48; cada ponto não alcançado inicia uma componente (vizinhança 4, BFS) numerada em ordem 0, 1, 2…
3. Para cada componente, na ordem: cria `Area(sala)` e procura portas nas bordas, na ordem **borda de cima (Up, varrendo x), esquerda (Left, varrendo y), de baixo (Down), direita (Right)**. Uma porta é uma sequência contínua de pontos da componente na borda; vira `Neighbor(dir, door0·pd − pointRadius, (último)·pd + pointRadius)`.
4. Componente sem porta é **cancelada** (vira `null`; não entra em `areas`). Se todas foram canceladas (inclusive sala toda parede), cria uma única área sem portas. Senão, os pontos das canceladas viram parede.
5. Frequência de respawn, por time e por retângulo de respawn do time **nesta sala**: se a sala tem 1 área real, soma `1/n` (n = total de retângulos do time no mapa) a ela; senão conta os pontos não-parede de cada área dentro de `[trunc((x1+pd/2)/pd) .. trunc((x2+pd/2)/pd)] × [mesmo em y]` e soma `pontos/total/n`. Retângulos do "time 2" contam para os dois times.
6. Árvore: 1 área → folha; senão `AreaSplitter` na caixa inteira (0,0)–(64,48).

### AreaSplitter (caixa x0..x1, y0..y1)
1. Por área: `count`, `minX/maxX/minY/maxY` dos pontos dela na caixa (iniciais `x1/x0/y1/y0`).
2. Se só uma área tem pontos → folha.
3. `testAxisPoints` em x e depois em y (o melhor valor é compartilhado; empate fica com o primeiro): `minValue/maxValue` sobre **todas** as entradas (inclusive count 0); pontos candidatos = `min_i ≠ minValue` e `max_i+1 ≠ maxValue`; testa o meio `minValue + (maxValue−minValue+1)/2` com valor `(maxValue−minValue)·10`; ordena os candidatos e, para cada um distinto, atualiza `inteirasAntes` (áreas com `max = p−1`), testa `antes·depois·100000 + ((antes? tamDepois:0) + (depois? tamAntes:0))·40 + min(tamAntes, tamDepois)`, atualiza `inteirasDepois` (áreas com `min = p`) e, se nenhuma área ficou quebrada, testa o meio da faixa vazia `(p + próximo)/2` com `antes·depois·100000 + 90000 + min(...)`.
4. Corte em x antes de `p`: `SplitByX(esquerda: x0'..p−1, direita: p..x1', fronteira (p−0,5)/64·plw)` sobre a caixa reduzida aos limites em uso; em y: fronteira `(p−0,5)/48·plh`. `find` vai para o primeiro filho se `coord < fronteira`.

### Ligação (`initialize`)
1. Para cada área (ordem de `areas`) e cada vizinho na ordem: ao mudar de direção, esquece as áreas já vistas. A área do outro lado é `identifyArea` na sala vizinha (toroidal, `positiveModulo`), na borda oposta (`x = plw` indo para a esquerda, `0` para a direita) e no meio da porta.
2. Se essa área ainda não apareceu nesta direção: fica, e esta área entra em `reverseNeighbors` dela. Senão a porta é anexada ao vizinho anterior e este é removido.
3. `respawnValue[t] = rf[t]·0,5 + Σ (rn.rf[t]·0,5 / rn.neighbors.size)` sobre `reverseNeighbors` (repetições contam duas vezes).

### Tabela de distância (`BuildDistanceTable`)
1. Descritor (centro, peso): se igual ao da última construção desta tabela, não recalcula (o time **não** faz parte do descritor).
2. Zera tudo para −1; centro = 0 e entra num `std::priority_queue` (menor distância no topo).
3. Tira o topo; para cada vizinho ainda −1: `dist = 1 − rv[meuTime]·peso·0,5 + rv[outroTime]·peso`; distância = `d(atual) + trunc(dist·1000)`; entra na fila. O rótulo é definitivo na entrada, então a ordem entre empates do heap da libstdc++ muda o resultado — o port reproduz `push_heap`/`pop_heap`.
4. Tabelas: `Main` (centro no bot, peso `myRespawnWeight`), `Def` (centro numa posição, peso 0), `Destination` (centro no destino, peso `myRespawnWeight`).

## Posição no frame
Fora da simulação: o AreaMap é montado quando o bot recebe o mapa (`BuildMap`, na troca de mapa) e as tabelas a cada decisão do bot (OG-051/OG-053).

## Casos de borda
1. Sala toda parede ou só com bolsões sem saída: uma área sem portas; vizinhos de fora podem apontar para ela.
2. Mapa com 1 sala de altura/largura: a mesma área pode ser vizinha em duas direções (dois `Neighbor`, `reverseNeighbors` repetido).
3. Duas portas da mesma borda para a mesma área: um `Neighbor` com duas portas.
4. Portas começam/terminam fora da sala (`−pointRadius`, `plw + pointRadius`).
5. `identifyArea` com coordenada local fora da sala usa a árvore normalmente; sala inválida → `areas[0]`.
6. Área sem caminho: distância −1.

## Divergências intencionais
- **Distâncias fora das áreas** (D-29): no original cada bot copia o AreaMap inteiro (`operator=`) porque as distâncias moram nas Areas. Na web o AreaMap é imutável e compartilhado; as três tabelas de cada bot são `Int32Array` indexadas por `Area.index` (`DistanceTables`). Mesmo resultado, sem cópia por bot.
- Cache por (CRC, título) como `BotSharedDataStorage`, sem mutex (Node é single-thread).

## Vetores de teste
`packages/bots/src/__fixtures__/areamap.json.gz`, gerado por `tools/parity/fixtures/areamap.cpp` com o código original:
- 46 mapas (`maps/`, `cmaps/` e o sintético `tools/parity/fixtures/areamap-maps/split-rooms.txt`, com salas divididas em até 6 áreas, bolsão cancelado, sala toda parede, áreas em L, portas múltiplas e respawn sobre salas divididas): áreas, portas, `reverseNeighbors`, respawn e árvore de cada sala.
- `outgun1`, `ksii` (respawn por área) e o sintético: 130 amostras de `identifyArea` por sala e as tabelas de distância a partir de cada área com peso 0 e 1 e os dois times.
- Resultado: tudo idêntico, exceto `respawnValue`, que difere em 1 ulp num caso (`-ffast-math`); comparado com 12 dígitos.

Custo medido (Node, M-series): montar o AreaMap de `outgun1` ≈ 16 ms (uma vez por mapa); uma tabela de distância ≈ 3 µs.
