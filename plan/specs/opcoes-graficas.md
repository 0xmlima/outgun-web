# Spec: opções gráficas e de jogo avançadas
Card(s): OG-070 · RNs: — (complementa `opcoes-jogador.md`, OG-068)

## Resumo
As opções finas do `Menu_graphics`, de parte do `Menu_game` e do fundo do `Menu_theme` do cliente
original. Cada uma só troca uma alternativa de desenho; o comportamento padrão já era o do renderer
web. Padrões: os do `config/client.cfg` distribuído ("visão original", D-05).

## Fonte
- `src/client_menus.cpp:515-590` — `Menu_graphics`: rótulos, faixas e defaults de código; `src/client_menus.h:315-348` — enums e `emphasizeFlag`, `showNeighborMarkers`.
- `config/client.cfg` + `enum ClientCfgSetting` (`src/client_menus.h`, base 0) — valores distribuídos (índices abaixo).
- `src/guiclient.cpp:3371-3425` — `repeatMapX/Y`, `getViewStartCoord`, `viewTopLeft` (rolagem, vista sobre a borda).
- `src/guiclient.cpp:2924-2943` — `mapWrapsX/Y`: borda do mapa com passagem (algum ponto da borda onde um jogador cabe, testado a cada `PLAYER_RADIUS/2`).
- `src/guiclient.cpp:3609-3656` — `draw_map`: névoa, caixa da área visível, bandeiras sumidas no minimapa, piscar de bandeira devolvida.
- `src/guiclient.cpp:3658-3757` — `draw_playfield`: bandeiras sumidas (com o tempo sem notícia), bandeira enfatizada, destaque ao nascer.
- `src/guiclient.cpp:3778-3807` — marcadores de vizinhos; `src/graphics.cpp:1190-1240` — `draw_neighbor_marker`.
- `src/guiclient.cpp:3825-3858` — `calculateVisibilities`: modos dos jogadores sumidos no minimapa.
- `src/graphics.cpp:812-850` — `draw_flag`: quatro triângulos da bandeira enfatizada, contador de tempo sem notícia (≥ 3 s).
- `src/graphics.cpp:489-643` — `drawRoomBackground`: modo de informação do mapa (áreas de respawn, pontos de spawn, grade 16×12).
- `src/graphics.cpp:905-925, 1400-1420, 1488-1495, 2685-2695` — "menos transparência": névoa sólida no minimapa, sem círculo do portador do deathbringer, sem rastro de turbo, fumaça do deathbringer opaca e menor.
- `src/graphics.cpp:1830-1842` — sublinhado no placar de quem tem conta (`masterAuth`); `1892, 2019, 2200` — alfa do fundo das telas de estatísticas.
- `src/graphics.cpp:2799-2806, 2865-2868, 3370-3390` — fundo da tela (`background.pcx`) do tema, em mosaico.
- `src/guiclient.cpp:2790-2795` — "ficar morto no menu": com um menu aberto, o `client_ready` da troca de mapa espera o menu fechar.

## Settings e constantes
| Opção | `client.cfg` | Valores | Distribuído | Web |
|---|---|---|---|---|
| Scrolling | 62 | não/sim | não | `scroll` |
| Antialiasing | 14 | sim/não | sim | ver divergências |
| Less transparency effects | 40 | não/sim | não | `lessTransparency` |
| Disappeared players on minimap | 37 | fade / hide early / hide late | fade | `minimapPlayers` |
| Highlight returned and dropped flags | 46 | sim/não | **não** | `highlightReturnedFlags` |
| Make flags extra-visible | 53 | never / multi-roomed / always | never | `emphasizeFlags` |
| Show flag disappearance positions | 65 | não/sim | **não** | `oldFlagPositions` |
| Highlight self after spawn | 48 | sim/não | sim | `spawnHighlight` |
| Markers for nearby players and flags in game | 49 | never / single-roomed / always | never | `neighborMarkers` |
| Box visible area on map in game | 51 | sim/não | sim | `boxVisibleArea` |
| Let view follow over map border | 52 | never / map doesn't fit / map wraps / always | map wraps | `viewOverBorder` |
| Allow parts of map to repeat on screen | 61 | não/sim | não | `repeatMap` |
| Highlight maps not in maps.txt | 72 | não/sim | não | `highlightUnknownMaps` |
| Stats screen alpha | 15 | 0..255, passo 15 | 255 | `statsAlpha` |
| Map info mode | — (não salva) | não/sim | não | `mapInfoMode` |
| Stay dead when in a menu at round start | 39 | sim/não | sim | `stayDeadInMenus` |
| Underline master-authenticated players | 29 | sim/não | sim | `underlineAccounts` |
| Background / Prefer main theme background | 42 / 41 | tema / sim | `<no background>` / sim | `backgroundTheme`, `preferThemeBackground` |

Constantes: fade 10→20 frames; hide early corta em 12; hide late em 20. Marcador de vizinho: margem 15,
bandeira 8→5, jogador raio 10→5 (escala com a distância < 1 sala). Destaque ao nascer: 0,5 s, círculo
`(8 × tamanho + 1) × PLAYER_RADIUS`. Bandeira devolvida pisca por 2 s quando `trunc(t × 15) mod 3 = 0`.
Bandeira enfatizada: 4 triângulos de lado `20` (escala da sala) ao redor. Modo de informação: respawn
com alfa 120, spawn como círculo do raio do jogador, grade 16 × 12 (linhas do meio em destaque).

## Algoritmo
- Vista: `getViewStartCoord` com `scroll` e `viewOverBorder` do jogador e `mapWraps` do mapa; `repeatMapX = repeatMap && (view = always || mapWrapsX)` (idem Y), que também libera mais salas que o mapa no layout.
- Caixa da área visível no minimapa: `(salas visíveis > 1 em algum eixo || scroll) && boxVisibleArea`.
- Minimapa: `max_time/start_fadeout` = 20/10 (fade), 12/12 (hide early), 20/20 (hide late).
- Bandeiras: piscar só com `highlightReturnedFlags`; enfatizar (sem piscar) quando `emphasizeFlags ≠ never && (salas visíveis ≥ 2 || always)`; bandeiras sumidas (minimapa e sala) só com `oldFlagPositions`, com o contador de segundos sem notícia a partir de 3 s.
- Marcadores de vizinhos: `always`, ou `single-roomed` com menos de 2 salas visíveis: bandeiras sumidas (contorno), jogadores (círculo) e bandeiras (quadrado) a menos de 1 sala da borda da vista, na borda.
- Menos transparência: névoa do minimapa sólida (fundo com névoa) em vez de alfa; sem rastro de turbo e sem o círculo do portador do deathbringer.
- Ficar morto no menu: com o menu do jogo (Esc) ou uma tela F1–F5 aberta, o `clientReady` da troca de mapa espera fechar.

## Casos de borda
1. Mapa sem passagem na borda: `view = map wraps` age como `never`; repetir o mapa só vale com `always`.
2. Mais salas visíveis que o mapa sem repetir: a vista centraliza (não segue o jogador).
3. Marcador de vizinho nos dois eixos ao mesmo tempo (canto): não desenha (o original só desenha num eixo).
4. Opções mudadas no meio da partida valem no quadro seguinte (o fundo das salas é repintado se mudar o modo de informação).

## Divergências intencionais
- **Antialiasing:** o navegador sempre suaviza o desenho em canvas; desligar não muda nada visível e a opção não é oferecida.
- **Underline server-authenticated players** (`auth.txt` local do servidor) não existe na web; só o sublinhado de quem tem conta.
- **Rooms on screen in replay** fica com o player de replay (OG-091).
- **Highlight maps not in maps.txt:** na web não há `maps.txt` local; destaca na lista de mapas os que não estão nos mapas do jogo (gerados ou próprios do servidor).

## Vetores de teste
- Padrões iguais ao `client.cfg` distribuído (teste das preferências).
- `mapWraps` dos mapas do jogo (ex.: `outgun1` sem passagem, mapas com corredor na borda).
- Cálculo do alfa do minimapa por modo; posição dos marcadores de vizinhos; layout com repetição.
