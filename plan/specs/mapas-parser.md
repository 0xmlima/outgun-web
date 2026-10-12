# Spec: formato e parser de mapas
Card: OG-010 · RNs: RN-MAP-01, RN-MAP-03, RN-MAP-04, RN-MAP-05

## Resumo
Port fiel de `Map::parse_file`/`Map::parse_line`: mesmos comandos, mesmas validações, mesmas mensagens de erro, mesmo CRC e mesma geometria resultante (inclusive arredondamentos).

## Fonte
- `src/world.cpp:375-500` — `Map::load`, `load_file`, `parse_file` (coleta de linhas, rótulos, CRC, validações finais).
- `src/world.cpp:486-775` — `Map::parse_line` (todos os comandos).
- `src/world.cpp:60-345` — `subIntersection`, construtores e `intersects_rect`/`intersects_circ` das paredes; `Room::fall_on_wall`.
- `src/commont.cpp:164-188` — `getline_smart`, `getline_skip_comments`; `src/utility.cpp:236` — `trim`.
- `src/network.cpp:763` — `CRC16` → HawkNL `nlGetCRC16` (tabela extraída do `libNL.so.1.6.8`).
- `doc/maps.html`, `doc/map-tutorial.html` — documentação do formato.

## Algoritmo
1. **Linhas:** texto ISO-8859-1 dividido em `\n`/`\r` (linhas vazias descartadas). Linha cujo **primeiro caractere bruto** é `;` é comentário; `trim` remove espaço, tab, `\n`, `\r` e `0xA0` das pontas; linhas vazias após o trim são ignoradas.
2. **CRC:** concatena cada linha significativa aparada + `\n` (inclusive rótulos e linhas de rótulo) e calcula o CRC-16 do HawkNL.
3. **Rótulos:** linha `:nome` abre um bloco; tudo depois pertence a blocos. Nome vazio, com espaço (`isspace` do locale C) ou repetido é erro imediato.
4. **Linhas de topo** interpretadas em ordem, com cursor `(crx, cry)` e escala `(scalex, scaley)` iniciais `(0, 0)` e `(1, 1)`.
5. **Leitura de valores** com semântica de `istringstream`: campos opcionais só são lidos se o stream ainda está `good()` (não chegou ao fim); a linha é inválida se alguma leitura falhou ou se sobrou texto (`!eof`).
6. **Comandos:**
   - `W`/`G x1 y1 x2 y2 [tex [alpha]]` — retângulo; coordenadas × `472/scalex` e `354/scaley`.
   - `T W|G x1 y1 x2 y2 x3 y3 [tex [alpha]]` — triângulo (vértices ordenados por y).
   - `C W|G x y r [ri [a1 a2 [tex [alpha]]]]` — círculo/anel/setor; **raios usam a escala vertical**; ângulos negativos +360; inválido se `r ≤ 0`, `ri < 0`, `ri ≥ r`, `a1 ≠ 0 && a1 = a2`, ângulos fora de [0, 360).
   - `R x y` — sala ativa (proibido dentro de rótulo).
   - `X nome x1 y1 [x2 y2]` — aplica o bloco a cada sala do retângulo (y externo, x interno); a escala começa, em cada sala, da escala vigente no `X`; proibido dentro de rótulo.
   - `P width|height n` (1..255, uma vez cada), `P title|author texto` (resto da linha aparado, não vazio, uma vez cada).
   - `spawn t rx ry x y` (t 0..1), `flag t rx ry x y` (t 0..2): exigem `0 ≤ x < scalex`, `0 ≤ y < scaley`; posição **truncada para inteiro** `trunc(x·472/scalex)`.
   - `V respawn t rx ry [x1 y1 [x2 y2]]` — sem coordenadas: sala inteira; um ponto: área pontual; dois pontos: retângulo ordenado. Coordenadas `x·472/scalex`; exceto área pontual, encolhe 15 px em cada borda. t = 2 adiciona aos dois times. Outros `V ...` são aceitos sem efeito.
   - `S sx sy` — escala (> 0).
   - Qualquer outra coisa: `Unrecognized map line`.
7. **Validações finais:** largura, altura e título obrigatórios. Para os times 0, 1 e as bandeiras selvagens: bandeira tocando parede (raio 15) e spawn tocando parede (raio 15) acumulam erros; área de respawn sem espaço encerra na hora. Espaço livre: grade de 15 px a partir de `(x1, y1)`; precisa de `max(1, ⌊pontos/20⌋)` pontos livres com folga de 18 px (`15·5/4` inteiro).

## Casos de borda (todos cobertos por `tools/parity/fixtures/maps-edge/`)
1. `  ; comentário` (com espaço antes) **não** é comentário → `Unrecognized map line`.
2. `0xA0` no fim da linha é removido pelo trim; no meio da linha não separa valores → linha inválida.
3. `1e` como número é inválido; `+.5`, `1.`, `2e0` são válidos.
4. Finais de linha `\r\n`, `\r` sozinho e `\n` são equivalentes.
5. Token sobrando (`W 0 0 .1 .1 0 255 7`) invalida a linha.
6. Título com bytes acima de 0x7F é preservado (ISO-8859-1).

## Divergências intencionais
Nenhuma. `MapInfo::infoHash` (hash de título/autor/tamanho para a lista de mapas do cliente) não foi portado aqui; entra com a lista de mapas (OG-045/OG-066).

## Vetores de teste
- `packages/content/src/map/__fixtures__/maps.json` — resultado do parser original para os 45 mapas e 20 arquivos de borda (`pnpm oracle fixture maps ...`).
- `packages/content/src/map/__fixtures__/crc16.json` — CRC16 original para entradas conhecidas.
- `packages/sim/src/map/__fixtures__/wall-intersections.json` — 20.301 consultas de interseção respondidas pelo original (`pnpm oracle fixture walls ...`).
