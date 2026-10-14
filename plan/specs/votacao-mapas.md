# Spec: rotação e votação de mapas
Card(s): OG-045 · RNs: RN-VOT-01, RN-VOT-02, RN-VOT-03, RN-VOT-04, RN-VOT-05

## Resumo
Como o servidor original escolhe o próximo mapa (votos, tempo desde o último jogo, votos negativos), quando a maioria troca de mapa no meio da partida (F8) e como os votos são anunciados.

## Fonte
- `src/server.cpp:565-672` — `server_next_map`: o mais votado; empate → o de `last_game` menor (jogado há mais tempo); ainda empatado → sorteio, tirando o atual. Sem votos: o seguinte da lista e, a partir dele, o com menos votos negativos (dá a volta e para no primeiro sem nenhum). Zera os votos no mapa escolhido, `want_map_exit` de todos, anota `last_game`, avisa a troca e mostra o placar por `game_end_delay`.
- `src/server.cpp:557-563` — `countNegativeVotes`.
- `src/server.cpp:775-795` — `check_map_exit`: só humanos votam para sair; com `require_specific_map_vote`, só conta quem votou num mapa; troca se a favor > contra e (tempo de mapa ≥ `vote_block_time` ou ninguém contra); recalcula os votos por mapa (todos os jogadores).
- `src/server.cpp:1597-1618` — anúncio `data_map_change_info` (votos, necessários = humanos/2 + 1, segundos de bloqueio) quando muda, no máximo a cada 5 s; ao fim do bloqueio, `check_map_exit`.
- `src/server.cpp:853-857, 896-897` — `random_maprot`: 1 embaralha a rotação; 2 sorteia o primeiro mapa.
- `src/servnet.cpp:1657-1667, 1756-1776` — `data_map_exit_on/off`, `data_map_vote` (inválido = −1), `data_negative_map_votes`; aviso "Your vote has no effect until you vote for a specific map." com `require_specific_map_vote`.
- `src/servnet.cpp:1570-1573` — saída de jogador também verifica a troca.
- `src/guiclient.cpp:1700-1720, 2431-2449, 3439-3460` — cliente: "This map is $1 ($2 of $3).", F8 liga/desliga o voto, "EXIT MAP" piscando (cinza se "atrasado"), placar no fim por capturas e por voto; `src/clientbase.cpp:1427-1438` — "*** $1/$2 votes for mapchange." + "(All players needed for $1 more seconds.)".

## Regras da versão web
1. O voto num mapa específico usa a lista de mapas (F2), que é do OG-066; o servidor já aceita `mapVote` e `negativeMapVotes` e manda `mapList`, `mapVotes` e `currentMap`.
2. Troca por voto não gera resultado de partida para estatísticas/ranking (o jogo foi interrompido).
3. `/forcemap` e reinício pelo admin (RN-VOT-05) ficam com os comandos do OG-046.

## Divergências intencionais
Nenhuma.

## Casos de borda
1. Todos os mapas com votos negativos: vai para o com menos, a partir do seguinte.
2. Votos empatados e nunca jogados: sorteio entre eles, nunca o atual.
3. Sala só com bots e um humano: o humano decide sozinho.
4. Voto no mapa que acabou de ser escolhido: zerado na troca.

## Vetores de teste
- `apps/game-server/src/map-vote.test.ts`: sem votos, negativos, mais votado, empate por tempo, sorteio sem o atual, bloqueio, bots, voto específico, anúncio e ordem da rotação.
- `apps/game-server/src/room.test.ts`: lista na entrada, troca por voto para o mapa votado (bot não conta), anúncio e negativos.
