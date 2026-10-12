# Spec: pontuação e estatísticas
Card: OG-028 · RNs: RN-PTS-01..03, RN-STA-01..03

## Fonte
- `src/server.cpp:489-511` — `Server::score_frag` (soma em `stats.frags` e no delta de ranking) e `score_neg` (só ranking).
- Chamadas de pontuação em `src/world.cpp`: 1782 (largar de propósito), 2259-2261 (morte e morte com bandeira), 2320-2355 (`damagePlayer`), 2395 (suicídio), 3307 (devolução), 3640 (pegar), 3659-3665 (captura), 3688-3690 (posse da selvagem).
- `src/world.h:266-360`, `src/world.cpp:4069-4211` — `Statistics` (contadores, `finish_stats`, `accuracy`, `lifetime`, `average_lifetime`, `playtime`, `speed`, `flag_carrying_time`).
- `src/world.h:692-760` — `Team` (contadores, `caps`, `accuracy`, `movement_outgun_units`).
- `src/world.cpp:64-68` — `compare_players`; `src/world.cpp:3752-3910` — `save_stats` (tabelas do HTML de estatísticas).
- `src/server.cpp:565-578` — `server_next_map`: `finish_stats` de todos antes de salvar e reiniciar.

## Algoritmo
1. **Frags** (`scoreFrag`): todo evento soma em `stats.frags` e avisa o ranking. Tabela em PLAN 6.8.
   - Morte de inimigo: +1 (aliado: −2). Depois, só contra inimigo, **um** bônus de sala de +1, na ordem: aliado do atacante (outro que não ele) carregando qualquer bandeira na sala do morto; bandeira do time do atacante não carregada na sala (só sem `lock_team_flags` em efeito); bandeira do time do morto não carregada na sala (idem). "Não carregada" inclui na base.
   - Morto carregando bandeira: +1 e `carriersKilled` se inimigo; −1 se aliado.
   - Pegar +1; largar de propósito −1 (não ao morrer nem ao entregar na captura); devolver +1; capturar +3 e assistência +3; captura do próprio time +2 para cada membro (inclusive capturador e assistente); posse da selvagem +2 para cada membro; suicídio −1.
2. **Pontos negativos** (`scoreNeg`, só ranking): morte +1 (`killPlayer`, inclusive suicídio) e +1 se largou bandeira ao morrer; bandeira de time capturada: +1 para cada membro do time adversário do capturador (selvagem não); posse da selvagem: +1 para cada membro do outro time.
3. **Estatísticas**: contadores atualizados nos mesmos pontos (já conferidos frame a frame nos traces). Derivados:
   - `accuracy = hits / shots` (0 sem tiros); `lifetime` = acumulado + vida atual; `average_lifetime = lifetime / (deaths + 1)`; `playtime = agora − starttime`; `movement_outgun_units = pixels / 30`; `speed = unidades / lifetime` (0 sem tempo vivo); `flag_carrying_time` = acumulado + posse atual.
4. **Fim de partida**: `finish_stats` fecha vida e posse em andamento de cada jogador; o resultado (equivalente a `save_stats`) traz configuração, times (placar = capturas + pontos de posse, contadores, precisão, movimento em unidades, capturas com tempo) e jogadores na ordem `compare_players` (vermelhos antes; por frags decrescentes; estável).

## Na sim
- `hooks.scoreFrag` / `hooks.scoreNeg` são os eventos de pontuação (o ranking, OG-084, aplica os modificadores de time do original).
- `stats.ts`: métricas derivadas, `finishStats`, `comparePlayers` e `finishMatch`, que monta o `MatchResult` entregue em `hooks.gameOver(reason, result)` antes do reinício do mapa.
- Divergência de forma: o HTML de `save_stats` vira o JSON `MatchResult` (nomes resolvidos fora da sim, capturas com pid e assistente). A gravação em arquivo e a exibição F3/F4 ficam com OG-085 e o cliente.

## Casos-limite
- `save_stats` do original só roda com humanos suficientes (`save_stats` ≥ 1 humano); a versão web sempre produz o resultado e o servidor decide se persiste.
- No frame do fim de partida o estado seguinte já é o mapa reiniciado; o placar final é o do momento do fim, fechado com `finish_stats`.

## Vetores de teste
- `scoring.test.ts`: uma linha da tabela de frags por teste, pontos negativos e o resultado da partida.
- Traces (`flagFields` compara todas as estatísticas de jogadores e times a cada frame): `bots-match`, `flag-*`, `match-*`, `rocket-hit`...
- `parity.test.ts` → "placar final": `match-time-win` e `match-extra-time` comparam o `MatchResult` da sim com as estatísticas do original no fim da partida.
