# Spec: HUD (barra de baixo, placar, minimapa, mensagens e chat)
Card(s): OG-065 · RNs: RN-VIS-02, RN-PAR-02, RN-CHT-01

## Resumo
O que o cliente original desenha em volta e por cima das salas durante a partida: o layout da tela (área de jogo à esquerda, minimapa e placar à direita, barra de indicadores embaixo), as barras de vida e energia, os tempos de power-up, o nível da arma e o relógio, o placar dos times com os jogadores, o minimapa com névoa, as mensagens de eventos e o chat, e os avisos de fim de partida.

## Fonte
- `src/graphics.cpp:150-230` — `make_layout`: `scr_mul = SCREEN_W/640` (ou `SCREEN_W/plw` sem minimapa e placar, F12); altura mínima: `SCREEN_H ≥ scr_mul·plh + barra + 1 linha`, senão `scr_mul = (SCREEN_H − barra − linha)/plh`; barra de baixo `3·(altura_fonte+2)+5`; área de jogo em `(0, SCREEN_H − scale(plh) − barra)` (centralizada sem minimapa); lugar do minimapa à direita (`largura − área − 4`), em cima se couber à direita do chat (`> 80 "M"`), com `scale(100) + y_jogo − 4` de altura (+ sobra até 450 px de placar); placar abaixo do minimapa até o fim da tela; barra: vida, energia, power-ups, arma e relógio espaçados (relógio vai para a 2ª linha se não couber).
- `src/graphics.cpp:3190-3196` — `scale(v) = iround(scr_mul·v)`.
- `src/graphics.cpp:355-361` — linhas de chat: `max(1, y0_salas/(altura+3))`; com Insert, `max(1, (y_jogo + scale(plh))/(altura+3))`.
- `src/graphics.cpp:2279-2373` — `draw_powerup_time` (linhas 0..2: Power, Turbo, Shadow, segundos à direita com 3 dígitos), `draw_player_weapon` ("Weapon $1"), `draw_map_time` (`[ET ]m:ss`, alinhado à direita), `draw_change_team_message`/`draw_change_map_message` (piscam a 2 Hz no canto da área de jogo), `draw_bar` (legenda + valor de 3 dígitos; barra de `scale(100)` de `y + 1,5·altura` até `SCREEN_H − 5`, faixas 0–100, 100–200, 200–300 com cores próprias).
- `src/graphics.cpp:2173-2176` — `draw_fps`: "FPS:$1" no canto de baixo à direita.
- `src/graphics.cpp:1737-1870` — `draw_scoreboard`: 20 colunas; legenda "Red Team"/"Blue Team" + "$1 capt" (ou "pings" com Tab); jogadores com o nome (15 caracteres) na cor pessoal clareada (`40 + c·215/255`), frags (ou ping) à direita na cor clara do time, bandeirinha se carrega bandeira; fundos, linhas e espaçamentos calculados para caber 2 + maxplayers + 1 linhas.
- `src/graphics.cpp:1722-1735` — `draw_waiting_map_message`, `draw_loading_map_message`, `draw_scores` ("RED TEAM WINS"/"BLUE TEAM WINS"/"GAME TIED", "SCORE $1 - $2").
- `src/graphics.cpp:864-976, 1037-1188` — minimapa: tamanho na proporção 4:3 por sala dentro do lugar; fundo com chão, paredes, bordas de sala, bases pintadas com a cor escura do time (preenchimento a partir de cada bandeira; empate pelo mais próximo), círculo em cada bandeira; névoa por sala (`fogOfWarMaxAlpha·(1 − visibilidade)`), retângulo das salas na tela, jogadores (quadrado do time com o miolo da cor pessoal), eu (círculo piscando), bandeirinhas (vazadas = posição antiga).
- `src/graphics.cpp:1190-1240` — `draw_neighbor_marker`: jogador ou bandeira numa sala vizinha (só um eixo de distância, menos de 1 sala) aparece na borda da área de jogo, maior quanto mais perto.
- `src/graphics.cpp:1312-1317` — `draw_me_highlight`: círculo amarelo que encolhe por 0,5 s ao renascer.
- `src/graphics.cpp:2428-2562` — `print_chat_messages`: a partir de (3, 3), `altura+3` por linha; cores por tipo (`normal`/`team` do time do remetente, `info`, `header`, `server`, `warning`), `$R`/`$G`/`$B`/`$>` trocam a cor no meio; entrada com "Say: ", "Say team: " (texto começando com `.`) ou "Command: " (`/`), cursor piscando a 1 Hz; contorno do texto com a fonte de borda em (x−1, y−1) por caractere.
- `src/guiclient.cpp:3432-3524` — `draw_game_frame`: com o jogo escondido (mapa carregando, placar, frame pulado) desenha só o fundo e os avisos; senão salas, entidades e minimapa; sempre placar, FPS, relógio (se há limite de tempo, a partida corre e há 2+ jogadores), power-ups, arma, vida e energia; mensagens visíveis por 80 s (todas com Insert); "servidor não responde" após 1 s sem pacote.
- `src/guiclient.cpp:3606-3657` — `draw_map`: névoa, destaque das salas na tela (só com mais de 1 sala ou rolagem), bandeiras "desaparecidas" (portador fora da vista há menos de 30 s, alfa 150), jogadores com a bandeira que carregam, bandeiras no chão (piscando 2 s ao voltar à base).
- `src/guiclient.cpp:3827-3858` — `calculateVisibilities`: alfa de cada jogador fora da sala pela idade da última posição (padrão "Fade": 255 até 10 frames, some linearmente até 20); a sala fica visível pelo jogador mais visível nela; com shadow, todas.
- `src/guiclient.cpp:1664-1975` — mensagens de eventos: mortes ("$1 was nailed by $2." etc.), sequência de 10 mortes ("is on a killing spree!", "killing spree was ended"), bandeiras ("GOT/LOST/DROPPED/RETURNED/CAPTURED THE $RRED FLAG$>!"), fim de partida ("CTF GAME OVER - FINAL SCORE: ..."), mapa ("This map is $1 ($2 of $3)."), troca de time; `src/clientbase.cpp:600-620, 1190-1200, 1390-1420` — entrou, saiu "com $2 frags", avisos de tempo.
- `src/clientbase.cpp:853-866, 976-989` — `data_pup_timer` (fim = agora + segundos), `data_weapon_change`, `data_map_time` (fim do mapa = agora + restante; 0 = sem limite).
- `src/servnet.cpp:1623-1634`, `src/server.cpp:1188` — chat: até `max_chat_message_length`, sem caracteres não imprimíveis; `.` = time; `/` = comando.

## Regras da versão web
1. Layout por resolução (v2, D-54, RN-UI-06; protótipo em `plan/specs/hud-resolucoes/`), com o canvas como "tela" (`L × H` em px CSS, D-13) e a fonte bitmap escolhida (altura 16 nas fontes do original):
   - Escala do HUD `u = max(1, arred½(min(H, L·¾)/700))` (ou a escolhida nas Opções, OG-296): texto, linhas (`(altura+3)·u`), barra de baixo (`3·(altura·u+2u)+5u`) e espaçamentos multiplicados por `u`.
   - Modo faixa (L/H < 1,5): chat na largura toda em cima, com `max(7 linhas + 6u, 22% de H)`; a sala usa a altura que sobra (`scr_mul = (H − chat − barra)/354`), à esquerda; minimapa começa na linha da sala, na largura da coluna (−8u), com a altura de um mapa 4×3 ocupando a largura, limitada para o placar caber; placar do fim do minimapa até a linha do FPS, com escala própria `s` ∈ {u…2u} (OG-294).
   - Modo coluna (L/H ≥ 1,5, OG-295): sala com a altura toda menos a barra; coluna da direita com largura mínima para os dois times lado a lado e 40 caracteres; chat (7 mensagens + digitação) no alto da coluna, minimapa abaixo, placar lado a lado até o FPS. Se a sala parar pela largura e sobrarem ≥ 4 linhas em cima (16:10), o chat volta para a faixa de cima na largura toda e o minimapa começa na linha da sala.
   - Chat mais estreito que 79 caracteres: as linhas são quebradas de novo na largura do chat.
   - Sem minimapa (F12): sala o maior possível, centralizada; o chat fica com o que sobra em cima (no mínimo 3 mensagens + digitação).
2. F12 alterna minimapa e placar, como no original (ação "Mostrar minimapa e placar", remapeável); fora do modo foco o navegador pode abrir as ferramentas de desenvolvimento.
3. O servidor passa a mandar o que o HUD precisa e ainda não ia: `scoreUpdate` quando o placar muda, `mapTime` ao entrar e a cada início de partida, `powerupTimer` e `weaponChange` ao jogador quando mudam, e repassa o chat (`text` normal ou de time, "Nome: texto"); comandos `/` e moderação ficam para o OG-046.
4. O cliente guarda a última posição de cada jogador (frame ou minimapa) com o frame em que foi vista, para a névoa e o alfa do minimapa.

## Divergências intencionais
0. (v2, D-54) O texto do HUD deixa de ter tamanho fixo em pixels e a escala da sala vem da altura que sobra, não de `largura/640`; minimapa na linha da sala e chat na largura toda em qualquer resolução.
1. Chat sem os comandos `/` do servidor e sem anti-flood até o OG-046 (o cliente já mostra "Command: ").
2. Sem o painel de depuração (F9 do original é captura de tela na web, D-15).
Registrado em PLAN seção 12 (D-19).
3. Mensagens com cor (`$R`...) sem tradução com cor no catálogo do 1.0.3 usam a tradução sem cor (o original as mostrava em inglês); pt-BR tem as versões com cor.

## Casos de borda
1. Tela baixa demais: `scr_mul` encolhe para caber a área de jogo, a barra e uma linha de mensagem.
2. Relógio não cabe na linha: vai para a linha de baixo, à direita da arma.
3. Jogador fora da vista há mais de 20 frames: some do minimapa; a sala fica com névoa.
4. Mensagem longa: quebrada em linhas de 79 caracteres (continuação com 4 espaços).
5. Mapa pequeno no minimapa: proporção 4:3 por sala, centralizado no lugar.

## Vetores de teste
- (original) 640×480 com fonte de 8 px: `scr_mul` 1, área de jogo 472×354 em y = 91, minimapa 164 px de largura em x = 474.
- (v2, fonte 16 px) 1024×768: u 1, área 720×540 em y 169, minimapa 296×167, placar 1×. 1280×960: u 1,5, área 880×660, placar 1,5×. 1440×1080: u 1,5, área 1004×753. 1600×1200: u 1,5, área 1129×847, placar 2×. 2048×1536: u 2, área 1440×1080, placar 2,5×. 1920×1080 (coluna): u 1,5, área 1313×985, times lado a lado. 1440×900 (coluna, chat em cima): área 888×666, 3 mensagens + digitação.
- Vida 250: barra vermelha cheia, amarela cheia, magenta pela metade.
