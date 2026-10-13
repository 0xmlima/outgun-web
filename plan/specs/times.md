# Spec: times (entrada, troca, balanceamento e cores)
Card(s): OG-044 · RNs: RN-TIM-01, RN-TIM-02, RN-TIM-03, RN-TIM-05

## Resumo
Em que time e vaga entra cada jogador, quando um pedido de troca (Ctrl+End) é atendido e como, quando bots dão lugar ou mudam de time para equilibrar, o balanceamento a cada mapa e a cor pessoal de cada um.

## Fonte
- `src/servnet.cpp:1333-1395` — `client_connected`: sala cheia → `remove_bot`; time com menos jogadores; empate: o único time com humanos e bots (o outro sem humanos), senão o com menos humanos, senão `getLessScoredTeam`; primeira vaga livre do time.
- `src/server.cpp:1064-1075` — `getLessScoredTeam`: modificador de ranking do time (`team_smul`), depois o placar, depois sorteio.
- `src/server.cpp:255-320` — `check_team_changes` (pedidos em ordem aleatória) e `check_player_change_teams`: respeita `team_change_time`; outro time com 2+ a menos → muda; outro time não maior e alguém lá quer trocar → troca os dois; meu time com 1 a mais → muda; senão (quem pede não é bot e há bots) troca com um bot do outro time: morto, senão sem bandeira, senão qualquer.
- `src/server.cpp:323-375` — `move_player` / `swap_players`: libera a cor, larga a bandeira (desfaz o frag da pegada), reinicia quem está vivo, leva foguetes/explosões/atacante de deathbringer (`changeEmbeddedPids`, `swapEmbeddedPids`, src/world.cpp:2459-2495), não quer mais trocar e só pode de novo em 10 s, nova cor, `data_team_change` (de, para, cor, cor do outro ou 255).
- `src/server.cpp:216-252` — `balance_teams` (muda sorteados do time maior até a diferença ser ≤ 1) e `shuffle_teams` (embaralha e troca os do vermelho que caíram no azul), em `ctf_game_restart` conforme `balance_teams`.
- `src/server.cpp:973-1010` — `remove_bot`: do time maior (ou qualquer, empatados): morto, sem bandeira, qualquer; por último do time menor.
- `src/server.cpp:1824-1864` — `server_think_after_broadcast`: pedidos vencidos; diferença de 2+ com bots → um bot do time maior (morto, sem bandeira, qualquer) pede troca.
- `src/server.cpp:420-460` — `check_fav_colors`: primeira favorita livre no time (mantém a atual se ela vem antes); sem favorita livre, mantém a atual ou sorteia uma livre.
- `src/servnet.cpp:1644-1650` — `data_change_team_on/off`; `src/clientbase.cpp:1210-1250` — o cliente move/troca o jogador e o "eu"; `src/guiclient.cpp:1940-1952` — mensagens "$1 and $2 swapped teams." / "$1 moved to red/blue team."; `src/graphics.cpp:2310-2318` — "CHANGE TEAMS" piscando.

## Regras da versão web
1. Bots são jogadores marcados (`playerJoined.bot`, sem IA até o OG-048) e nunca entram em salas Ranked (D-11).
2. `getLessScoredTeam` sem o modificador de ranking (OG-084): placar, depois sorteio.
3. O relógio de `team_change_time` é o do jogo (`frame / 10`, D-09).
4. Ao mudar de pid, o transporte do servidor passa a usar o pid novo para as mensagens do jogador.

## Divergências intencionais
Nenhuma (as regras 2 e 3 seguem D-09 e o ranking que ainda não existe).

## Casos de borda
1. Sala cheia só de humanos: entrada recusada (`serverFull`).
2. Bots não trocam com bots.
3. Pedido logo depois de uma troca: espera os 10 s e é atendido no tick em que vencer.
4. Quem carrega bandeira e troca: a bandeira cai onde ele estava e o frag da pegada é desfeito.

## Vetores de teste
- `apps/game-server/src/teams.test.ts`: cada ramo de RN-TIM-01, RN-TIM-02, `remove_bot`, equilíbrio por bots, `balance_teams`/`shuffle_teams` e cores.
- `apps/game-server/src/room.test.ts`: sala cheia de bots, troca com bot, cooldown de 10 s, bots equilibrando, cores favoritas.
