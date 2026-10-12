# Spec: render de salas e paredes
Card(s): OG-061 · RNs: RN-MAP-04, RN-VIS-01

## Resumo
Como o cliente original desenha o fundo da área de jogo: tamanho e posição das salas na tela (`RoomLayoutManager`), ponto de vista (`viewTopLeft`) e a imagem de cada sala (chão, áreas de chão, marcas de bandeira, borda da sala e paredes), com texturas do tema ou cores sólidas, guardada em cache.

## Fonte
- `src/graphics.cpp:150-230` — `Graphics::make_layout`: área de jogo (`playfield_x/y/w/h`) dentro da tela.
- `src/graphics.cpp:472-487` — `setRoomLayout`, `draw_background`.
- `src/graphics.cpp:489-648` — `Graphics::drawRoomBackground`: imagem de uma sala (ramo com antialiasing e ramo sem).
- `src/graphics.cpp:650-665` — `draw_flagpos_mark` (sem antialiasing).
- `src/graphics.cpp:667-810` — `draw_room_ground/walls`, `draw_rect/tri/circ_wall` (sem antialiasing).
- `src/graphics.cpp:2870-2922` — `load_floor_textures`, `load_wall_textures`, `get_floor/wall_texture`.
- `src/graphics.cpp:3205-3301` — `RoomLayoutManager::set`, `pf_scale`, `room_offset_x/y`, `on_screen`.
- `src/graphics.cpp:3472-3567` — `BackgroundManager::draw_playfield_background`, `cacheRoom`, `drawRoom`.
- `src/graphics.cpp:3576-3600` — névoa (`generateFogged`, `drawFogged`).
- `src/graphics.h:518,569` — `flagpos_radius = 30`, `playfieldFogOfWarAlpha = 0x38`.
- `src/antialias.cpp:468-500,700-715` — `SceneAntialiaser`: objetos em ordem de inserção, cada um cobre os anteriores; overlays se misturam por cima.
- `src/antialias.cpp:922-950` — `FlagmarkerPixelSource`: intensidade da marca de bandeira.
- `src/guiclient.cpp:3387-3425` — `getViewStartCoord`, `splitCompositeCoord`, `viewTopLeft`.
- `src/guiclient.cpp:3459-3474` — ordem de desenho do quadro.
- `src/guiclient.cpp:3827-3858` — `calculateVisibilities` (névoa por sala).
- `src/client_menus.cpp:515-560` — opções gráficas e seus defaults de código.
- `config/client.cfg` (linhas 13, 28, 62, 63) — valores distribuídos com o jogo.
- `src/colour_def.inc` — cores de fábrica (`ground`, `wall`, `room_border`, `playfield_fog`, cores de time).

## Settings e constantes
| Nome | Tipo | Faixa | Default código | Distribuído (`config/client.cfg`) | Uso |
|---|---|---|---|---|---|
| `plw × plh` | const | — | 472 × 354 | — | Tamanho lógico da sala (`commont.h:286`) |
| Salas na tela, jogo (`visibleRoomsPlay`, CCS 63) | int | 1–20 | **2** | **1** | Salas por direção |
| Salas na tela, replay (CCS 64) | int | 1–20 | 20 | 20 | Idem em replays |
| Rolagem (`scroll`, CCS 62) | bool | — | true | **false** | Vista acompanha o jogador ou só troca na mudança de sala |
| Antialiasing (CCS 14) | bool | — | true | (ausente → true) | Bordas suaves de paredes |
| Texturas contínuas (CCS 28) | bool | — | true | true | Padrão das texturas continua entre salas |
| Tema gráfico (CCS 13) | texto | temas de `graphics/` | — | `<no theme>` | Sem tema: cores sólidas |
| Repetir mapa na tela (`repeatMap`) | bool | — | false | — | — |
| Vista além da borda (`viewOverMapBorder`) | enum | never / not fit / map wraps / always | map wraps | — | — |
| `flagpos_radius` | const | — | 30 | — | Raio da marca de bandeira (unidades do mundo) |
| `playfieldFogOfWarAlpha` | const | — | 0x38 | — | Opacidade da névoa |
| Cores `ground`, `wall`, `room_border` | cor | — | #104000, #30C000, #202020 | — | Cores sólidas; `colours.txt` do tema pode trocar |

O `client.cfg` distribuído vale como "visão original" (mesma regra do D-01 para o servidor): **1 sala, sem rolagem, sem tema** (chão verde-escuro, paredes verdes).

## Algoritmo

### Layout (`RoomLayoutManager::set`)
Entrada: área de jogo `playfield_w × playfield_h` em pixels, tamanho do mapa, `visible_rooms`, `repeatX/Y`.
1. `vx = vy = visible_rooms`; sem repetição, `vx = min(vx, map_w)`, `vy = min(vy, map_h)`.
2. `room_w = int(playfield_w / vx)`, `room_h = int(playfield_h / vy)`.
3. Corrige a proporção encolhendo um lado: `rw' = iround(room_h·plw/plh)`, `rh' = iround(room_w·plh/plw)`; se `room_w > rw'` então `room_w = rw'`, senão se `room_h > rh'` então `room_h = rh'`.
4. `vx = playfield_w / room_w`, `vy = playfield_h / room_h` (fracionários); sem repetição, limitados a `map_w/map_h`.
5. `scale = (room_w/plw + room_h/plh) / 2`; `pf_scale(v) = iround(scale·v)`.
6. Origem centralizada: `plx = playfield_x + (playfield_w − int(room_w·vx)) / 2` (divisão inteira), idem `ply`.

### Posição das salas
`room_offset_x(rx)`: para `x = ((rx − topLeft.room.x + map_w) % map_w)·room_w − pf_scale(topLeft.x)` enquanto `x < vx·room_w`, somando `map_w·room_w`: cada valor `plx + x` é uma posição onde a sala aparece (a mesma sala pode aparecer mais de uma vez com repetição). Idem para y.

Salas desenhadas (`draw_playfield_background`): `xRooms = ceil(vx + topLeft.x/plw − 0,0001)`, `yRooms` idem; para `dx < xRooms`, `dy < yRooms`: sala `((topLeft.room.x + dx) % map_w, (topLeft.room.y + dy) % map_h)` em `(plx − pf_scale(topLeft.x) + dx·room_w, ply − pf_scale(topLeft.y) + dy·room_h)`, com recorte na área `[plx, plx + int(vx·room_w) − 1] × [ply, …]`.

### Ponto de vista (`viewTopLeft`, jogador `me` vivo no mapa)
Por eixo (`getViewStartCoord`), com `visible = repeat ? vx : min(map, vx)`:
1. `coordBase = 0`. Se `visible ≥ mapSize`: `coordBase = −(visible − mapSize)/2`, `visible = mapSize`; se o modo não permite passar da borda (`always`, ou `map wraps` com o mapa que dá a volta nesse eixo), devolve `coordBase`.
2. `center = sala + (scroll ? local/tamanhoSala : 0,5)`; `half = visible/2`.
3. Se o modo é `never` ou (não `always` e o mapa não dá a volta): `center − half < 0` → `coordBase`; `center + half ≥ mapSize` → `coordBase + mapSize − visible`.
4. Senão `coordBase + center − half`.
`splitCompositeCoord(c)`: `local = c mod 1` (positivo); sala `= positiveModulo(iround(c − local), map)`; coordenada local `= local·tamanhoSala`.
Sem jogador (`me < 0`) e fora de replay: `(0,0,0,0)`.

### Imagem de uma sala (`drawRoomBackground`, ramo com antialiasing, o padrão)
Bitmap `w × h` da sala; sala de textura `(texRoomX, texRoomY)` = `(rx, ry)` com texturas contínuas, senão `(0, 0)`; âncora do padrão `texOffsetBase = (−texRoomX·w, −texRoomY·h)`. As texturas são repetidas **na resolução nativa** (1 texel = 1 pixel da tela), não escaladas com a sala.
1. `scale = max((w − 0,02)/plw, (h − 0,02)/plh)`; `x0 = (w − scale·plw)/2`, `y0` idem (a sala preenche o bitmap e o excesso, se houver, é cortado igualmente dos dois lados).
2. Texturas de chão `0..7` (normal1–3, red, blue, ice, sand, mud): a textura `i` do tema; se faltar, a textura 0; se faltar a 0, cor sólida `ground`. Idem paredes (normal1–3, red, blue, metal, wood, rubber) com `wall`.
3. Objetos, em ordem (cada um cobre os anteriores; antialiasing por cobertura exata de pixel):
   1. retângulo `(0,0)–(plw,plh)` com o chão 0;
   2. cada área de chão da sala, na ordem do mapa, com sua textura de chão;
   3. *(modo info do mapa: áreas de respawn — fora do escopo)*;
   4. **marcas de bandeira** (overlay, misturado por cima): para cada bandeira vermelha, azul e neutra (`wild`) na sala, um quadrado de lado `2·30` centrado nela, com cor do time (`team_red_basic`, `team_blue_basic`, `wild_flag`) e alfa por pixel `min(256, int((R − d)·300/R))/256`, `R = 30·scale` e `d` = distância do pixel ao centro (em pixels do bitmap);
   5. **borda da sala**: faixas de 0,5 px nos quatro lados do bitmap, cor `room_border` (cobertura de meio pixel: a borda aparece como uma linha meio transparente; salas vizinhas somam as duas metades);
   6. **paredes**, na ordem do mapa, com a textura de parede.
4. Recorte em `[0,01; w − 0,01]`.

Paredes: retângulo `(x1,y1)–(x2,y2)`; triângulo pelos três pontos; círculo de raio `ro` com buraco `ri` (anel se `ri > 0`) e, se `angle[0] ≠ angle[1]`, setor de `angle[0]` a `angle[1]` graus **no sentido horário a partir do topo** (0 = cima, 90 = direita).

### Névoa
Sala com visibilidade `< 255` é desenhada com a cor `playfield_fog` (branco) a `0x38/255` por cima. Visibilidade (`calculateVisibilities`): começa em 255 em replay ou com shadow, senão 0; cada sala recebe o maior alfa entre os jogadores conhecidos nela (o próprio jogador sempre 255). Com 1 sala na tela a sala do jogador nunca tem névoa.

### Cache
Cada sala é desenhada uma vez e guardada (`cacheRoom`); o cache é invalidado ao mudar tema, cores, tamanho da sala, texturas contínuas ou modo info. Salas fora da tela podem ser descartadas (LRU, `lastUse`).

## Posição no quadro
`draw_game_frame` (`guiclient.cpp:3459-3474`): calcula visibilidades → `setRoomLayout` → `draw_background` (fundo da tela fora da área de jogo + salas) → `draw_playfield` (entidades, OG-062) → minimapa. Com o jogo escondido (sem mapa, placar de fim), só o fundo da tela.

## Casos de borda
1. Mapa menor que `visible_rooms` sem repetição: `vx = map_w`; a vista fica centralizada (`coordBase` negativo) e sobram faixas do fundo da tela.
2. Sala de bitmap não exatamente 4:3 (arredondamento): a escala é a maior das duas e o excesso é cortado dos dois lados.
3. Tema sem uma textura: usa a textura 0; sem a 0, cor sólida (ex.: tema Grass não tem `wall_rubber`).
4. Tema sem `colours.txt` (Grass, Metal...): cores de fábrica.
5. Setor com `angle[1] < angle[0]`: passa pelo 0 (ex.: 270 → 90 cobre a metade de cima).
6. Bandeiras do mapa sem uso no modo atual também são marcadas (a marca é do mapa).
7. Paredes que se sobrepõem: a que vem depois no arquivo fica por cima (só muda a textura vista).

## Divergências intencionais
1. **Antialiasing pelo Canvas 2D do navegador** (cobertura por amostragem) em vez do `SceneAntialiaser` (cobertura exata). Paredes consecutivas com a mesma textura são preenchidas num único caminho para não aparecer costura entre elas. Diferença esperada: no máximo 1 nível de cor na borda das formas.
2. **Texturas em pixels CSS**: 1 texel = 1 pixel CSS (em telas de alta densidade, `devicePixelRatio` texels de dispositivo), para manter o tamanho aparente do original em vez de texturas minúsculas em telas retina.
3. **Sem o ramo sem antialiasing** (opção desligável do original): o navegador sempre suaviza.
4. **Modo info do mapa** (áreas de respawn, spawns, grade) fica fora (é ferramenta de autoria de mapas).
Registrado em PLAN seção 12 (D-13).

## Notas sobre as referências
- No contêiner do oráculo (Xvfb 24 bits) a Allegro converte as cores ao desenhar na janela: o chão `#104000` aparece como `#073e00` e a parede `#30C000` como `#2cc100`, com ou sem antialiasing e também no minimapa. A captura (`xwd`) é fiel (testado com uma cor conhecida), então o desvio é do ambiente X, não do jogo: a versão web usa as cores de `colour_def.inc`. A métrica de comparação tolera esse desvio (canal com diferença > 40 conta como pixel diferente).
- Na vista de uma sala, o replay do original posiciona a vista pela sala de um jogador (`replayTopLeftRoom`, `guiclient.cpp:2914`); o comparador testa todas as salas e usa a mais parecida.

## Vetores de teste
- Layout: área 756×567 (tela 1024×768: `scr_mul` = 1,6, `playfield_w = ceil(1,6·472)`), mapa 3×3, 1 sala → `room_w = 756`, `room_h = 567`, `scale = 1,6017`. Com 3 salas: `room_w = 252`, `room_h = 189`.
- Referências visuais do original geradas pelo oráculo (`oracle.sh replay ... --cfg "13 TEMA" --cfg "64 N"`), 5 mapas (coliseu, 6_askelta, sisso, arena, outgun1) × 3 temas (sem tema, Ice, Grass), mapa inteiro e uma sala: `tools/parity/out/og061-ref/` (fora do git; o script do card as regenera).
