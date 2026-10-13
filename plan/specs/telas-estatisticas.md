# Spec: telas F1–F5, Tab e lista de mapas
Card(s): OG-066 · RNs: RN-STA-01, RN-STA-02, RN-VOT-01

## Resumo
Durante a partida, F1 abre a ajuda, F2 a lista de mapas (votar digitando o número + Enter), F3 as
estatísticas dos times, F4 as dos jogadores (4 páginas) e F5 as regras do servidor; Tab troca os
frags pelos pings no placar (já feito no OG-065). As telas F2–F4 abrem e fecham com a mesma tecla
(uma por vez); Esc fecha.

## Fonte
- `src/guiclient.cpp:2360-2460` — `handleKeypress`: F1 `toggle_help`, F5 `m_serverInfo`, F2/F3/F4 alternam `menusel`, Esc fecha a tela antes do menu.
- `src/guiclient.cpp:2462-2525` — `handleInfoScreenKeypress`: lista de mapas (↑/↓, PgUp/PgDn, Home/End rolam; dígitos até 3; Backspace; Enter vota — número − 1, ≥ 255 ou vazio = sem voto; Espaço/→ e ← trocam a ordenação, pulando "Favoritos" sem favoritos); jogadores (↑/←/PgUp página anterior, ↓/→/PgDn próxima, 0..3; Tab +1 e Shift+Tab −1 em ciclo); times (↑/↓ rolam as capturas). Com `Arrow keys in statistics` = "change stats view" (o `client.cfg` distribuído) as setas ficam com a tela.
- `src/guiclient.cpp:3934-3976` — `MapListSorter` e `draw_game_menu`: ordenação estável por número, votos (maior primeiro), título e autor (sem maiúsculas), tamanho (área, depois largura), favoritos.
- `src/graphics.cpp:1872-1994` — `team_statistics`: "Team stats", colunas Red/Blue: Captures, Kills, Deaths, Suicides, Flags taken, Flags dropped, Flags returned, Shots, Hit accuracy, Shots taken, Movement; depois as capturas em ordem de tempo `m:ss  vermelho - azul  capturador`, com rolagem.
- `src/graphics.cpp:1996-2133` — `draw_statistics` / `draw_player_statistics`: times separados ("Red Team (n)"), 4 páginas com os cabeçalhos e larguras do original; flags `M`/`R`/`A`, nome em 17 colunas; página 4 com rank, força e score do ranking (`$1 players in the ranking.`); "n/4".
- `src/graphics.cpp:2178-2276` — `map_list`: " Nr Vote Title                Size  Author", `*` no próprio voto, atual em destaque, rodapé com a ordenação e "Vote map number: _".
- `src/guiclient.cpp:315-372` — `TM_ServerSettings`: linhas da tela F5 (limites, prorrogação, devolução da bandeira, colisões, fogo amigo, opções, arma máxima, power-ups); abre sozinha ao conectar com `Show server info when connected`.
- `src/guiclient.cpp:1688-1760` — `netStatsReady`: com `Show stats after the round` ≠ off abre F3 ou F4 no fim da partida; fecha no começo da próxima se foi aberta assim.
- `src/servnet.cpp:706-776`, `src/server.cpp:570-590` — `send_stats`/`send_team_stats` ao entrar; no fim da partida, movimento e tiros de cada um e dos times e `stats_ready`.

## Algoritmo (web)
- **Servidor**: ao entrar, `stats` de todos e `teamStats` dos dois times; durante a partida, `stats` de um jogador quando um contador dele muda e `teamStats` quando um contador do time ou as capturas mudam (no máximo um por frame); no fim, `movementShots` de cada um, `teamMovementShots` e `statsReady`.
- **Cliente**: guarda o último retrato; tempos (jogo, vida, bandeira) avançam no cliente a partir do retrato (vivo e com bandeira); movimento/tiros/precisão só depois do fim da partida (como no original, ficam zerados durante o jogo); apagados no `worldReset`.
- Telas desenhadas com a fonte do jogo sobre o campo, no estilo das tabelas monoespaçadas do original.

## Divergências intencionais
- O original mantém as estatísticas no cliente a partir dos eventos e só recebe um retrato ao entrar; a web recebe o retrato a cada mudança (mesmos valores, sem recontar no cliente).
- Mapas favoritos (`Favorites`, mapas destacados/escurecidos e `Skip maps` com votos negativos) dependem do arquivo `maps.txt` do jogador: ficam para o OG-070; até lá a ordenação "Favoritos" é pulada, como no original sem favoritos.
- F5 lista também o preset da sala (Clássico, Ranked...).

## Casos de borda
1. Voto digitado acima do número de mapas: o servidor ignora (RN-VOT); vazio + Enter retira o voto.
2. Jogador que sai some das tabelas; as capturas dele continuam com o nome guardado no cliente (ou "?").
3. Mais capturas que linhas: rolagem; mais mapas que linhas: rolagem com Home/End.
