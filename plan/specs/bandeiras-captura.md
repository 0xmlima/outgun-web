# Spec: bandeiras e captura
Card: OG-027 · RNs: RN-FLG-01..10, RN-PTS-03

## Fonte
- `src/world.h:640-690` — `Flag`: estado (`at_base`/`carried`/`dropped`), portador, portador anterior e penúltimo, `grab_t`, `drop_t`, `cteam`/`ctime`.
- `src/world.cpp:4012-4066` — `Flag::take`, `return_to_base`, `drop`, `add_carrying_time`.
- `src/world.cpp:3948-4000`, `src/world.h:692-760` — `Team` (placar, `caps`, contadores, `reset_prev_carrier`).
- `src/world.cpp:1277-1340` — `WorldBase::returnFlag/dropFlag/stealFlag`, `add_random_flag`.
- `src/world.cpp:1734-1798` — `ServerWorld::dropFlag` (hora da queda), `dropFlagIfAny`, `resetCarrierData`.
- `src/world.cpp:1914-1925` — `check_flag_touch`.
- `src/world.cpp:2392-2400` — `suicide`.
- `src/world.cpp:3252-3365` — pegar, devolver e capturar no fim de `simulatePlayerPostPhysics`.
- `src/world.cpp:3367-3441` — `try_capture`, `is_near_base_for_capture`.
- `src/world.cpp:3555-3571` — pontos por posse da selvagem em `simulateFrame`.
- `src/world.cpp:3615-3697` — locks "em efeito", `player_steals_flag`, `player_captures_flag`, `team_gets_carrying_point`.
- `src/server.cpp:536-555` — bandeiras removidas na carga do mapa (`random_wild_flag`, locks).
- `src/servnet.cpp:1752` e `data_drop_flag` — tecla de largar.

## Algoritmo
1. **Carga do mapa:** com `random_wild_flag`, remove todas e sorteia uma selvagem: até 100 tentativas de `rx = rand() % w`, `ry = rand() % h`, `x = rand() % 472`, `y = rand() % 354` (nessa ordem, comandos separados) fora das paredes (raio 15). Senão, se existem os três tipos: `lock_team_flags && (lock_wild_flags || !capture_on_team_flag)` remove as de time (e as selvagens se `lock_wild_flags`); senão `lock_wild_flags && !capture_on_wild_flag` remove as selvagens.
2. **"Em efeito":** `lock_*` só vale com os três tipos de bandeira no mapa; `capture_on_team_flag`/`capture_on_wild_flag` valem sempre que **não** há os três tipos.
3. **Toque** (`check_flag_touch`): mesma sala e distância² < 30² (raio do jogador + da bandeira). Bandeira carregada usa a posição do portador; com `carry_own_team_flag`, portadores aliados que colidiram no frame se tocam em qualquer distância.
4. **Pegar** (por jogador, na ordem embaralhada, se vivo e fora de efeito de deathbringer): para ft = inimiga, selvagem, própria (só com `carry_own_team_flag`), pulando as travadas, e parando se já carrega uma. Bandeira não carregada tocada marca `touches_flag`; só é pega se `!dropped_flag && !drop_key`. Pegar dá +1 frag, `add_flag_take` (tipo, hora), +1 `flagsTaken` do time, revela shadow (254) e `take(pid, hora)`: `grab_t` só muda se estava na base; se o portador anterior é o próprio jogador, o anterior passa a ser o penúltimo; o penúltimo zera. Sem toque e sem a tecla, `dropped_flag` é limpo.
5. **Devolver** (sem `carry_own_team_flag`): bandeira do próprio time largada, tocada e com `frame / 10 >= drop_t + flag_return_delay` volta à base: +1 frag, `flagsReturned` do jogador e do time. Selvagens nunca são devolvidas por toque.
6. **Largar** (`dropFlagIfAny(pid, purpose, captureDrop)`): estatística `add_flag_drop(hora, !captureDrop)` (soma o tempo de posse; conta largada só se não for entrega), `flagsDropped` do time se não for entrega, a bandeira cai na posição exata do jogador (`drop`: anterior/penúltimo atualizados), `drop_t = frame / 10` só para bandeiras de time. `purpose` (tecla, saída, troca de time, entrega na captura) avisa os clientes e, se não for entrega, tira o frag de quem largou. Morrer chama sem `purpose` (−1 de ranking extra em `killPlayer`).
7. **Captura** (portador, depois de devolver): acha a bandeira carregada (times 0, 1, selvagens) e tenta, em ordem, até uma valer:
   - selvagem: (alvo própria, base própria) → (alvo inimiga, base selvagem) → (alvo selvagem, base selvagem);
   - inimiga: (própria, própria) → (selvagem, selvagem);
   - própria: (inimiga, própria) → (selvagem, própria).

   `try_capture` exige base própria com `capture_on_team` em efeito e alvo ou carregada do próprio time, ou base selvagem com `capture_on_wild` em efeito e alvo ou carregada selvagem. "Reversa" quando o time do alvo ≠ base: a capturada é o alvo. Para cada bandeira-alvo: perto da base (`capture_away_from_base`, ou alvo ou carregada a ≤ 15 px de uma base do time da base; sem `carry_own_team_flag` e base de time, "perto" é simplesmente o alvo/carregada estar na própria base); não carregada por inimigo; não é a própria carregada; se a carregada é do próprio time, alvo não carregado; se a carregada é selvagem e o alvo é inimigo, alvo não carregado; tocando; e não antes de `min_capture_time` desde `grab_t` da carregada (salvo se o alvo também foi pego há mais desse tempo e não está na base).
   - Assistente: o portador do alvo (aliado), senão o anterior da carregada, trocado pelo anterior do alvo se o primeiro não for aliado e o anterior do alvo não for o capturador. Só aliado conta.
   - `player_captures_flag`: +2 frags para o time do capturador, −1 de ranking para o adversário (exceto selvagem), +3 para capturador e assistente (+1 assistência), `add_capture`, placar +1 com o registro `(getMapTime() / 10, "nome (assistente)")`, devolve a capturada; `respawn_on_capture` zera a espera de respawn de todos.
   - Depois: se o alvo era carregado (pelo assistente), ele o entrega (`captureDrop`); captura normal devolve o alvo se não estava na base; reversa devolve a carregada. Limite de capturas (`capture_limit > 0`, placar ≥ limite e diferença ≥ `win_score_difference`) ou morte súbita na prorrogação → troca de mapa.
8. **Posse da selvagem** (`carrying_score_time > 0` e nenhuma bandeira de time): após a pós-física de todos, cada selvagem carregada soma 1 frame ao time do portador (trocar de time zera; largar não zera); a cada `10 × carrying_score_time` frames, zera, o time ganha 1 ponto (+2 frags para o time, −1 de ranking para o outro) e o limite é conferido.
9. **Suicídio:** se vivo, −1 frag, morte e suicídio nas estatísticas (tempo truncado), `suicides` e `deaths` do time, e `killPlayer` com a penalidade de tempo (larga a bandeira).

## Casos-limite
- `grab_t` não é inicializado no construtor de `Flag`: vale lixo de memória até a primeira pegada na base. Só é lido para bandeiras já pegas, então não afeta o jogo; os traces mostram valores como `4.6e-310`.
- Com `carry_own_team_flag` não há devolução por toque; a própria bandeira largada continua no chão até alguém do time pegá-la.
- A entrega da bandeira-alvo pelo assistente (`captureDrop`) não conta como largada nem desfaz frag.
- Pegar e largar no mesmo frame não acontece: quem largou fica com `dropped_flag` até sair de cima de toda bandeira.
- `−1 / TSIZE` é 0 em C++: um assistente −1 vira "aliado" do time 0 no teste, mas continua −1 (sem efeito).

## Divergências conhecidas do original
- **Relógio:** largar (tecla) e suicídio chegam pela rede e usam `get_time()` fora do frame, microssegundos antes do relógio do frame. A versão web processa os comandos com o relógio do frame (D-09); só o tempo de posse e o tempo de vida acumulados mudam, em microssegundos.
- **Placar:** a sim guarda capturas como `{tempo, pid, assistente}`; o nome é resolvido fora da sim.
- **Bug do original:** `random_wild_flag 1` com bots derruba o servidor (segfault ao iniciar; reproduzido no oráculo). A IA dos bots (OG-048) precisa funcionar com as bandeiras removidas na carga.

## Vetores de teste
- Traces (`flagFields`: estado completo dos jogadores, bandeiras e times; das capturas, só o tempo): `flag-capture`, `flag-assist` (min_capture_time recusado, assistência), `flag-drop-return` (tecla, `dropped_flag`, `flag_return_delay 3`; também modo free), `flag-suicide` (também free), `flag-wild-capture` (selvagem na base própria com `min_capture_time 1`; inimiga na base selvagem recusada), `flag-wild-base` (`capture_on_wild_flag`), `flag-carry-own` (captura com a própria bandeira carregada pelo assistente, entrega), `flag-locks`, `flag-carrying-score`.
- `packages/sim/src/world/flags.test.ts`: as 13 linhas da tabela × 4 combinações de settings, sem os três tipos, `capture_away_from_base`, `min_capture_time`, devolução e `carry_own_team_flag`, locks, carga do mapa, `random_wild_flag` e limite de capturas.
