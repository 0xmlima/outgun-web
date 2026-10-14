# Spec: ciclo da partida, spawn e respawn
Card: OG-029 · RNs: RN-PAR-01..05, RN-SPW-01..05

## Fonte
- `src/world.cpp:1807-1912` — `ServerWorld::respawnPlayer`.
- `src/world.cpp:1627-1632` — `WorldSettings::getRespawnTime`; `src/world.cpp:2228-2256` — `resetPlayer`.
- `src/world.cpp:3516-3548` — contagem do respawn e fila justa entre os times, em `simulateFrame`.
- `src/world.cpp:3581-3612` — limite de tempo, avisos, prorrogação e morte súbita, no fim de `simulateFrame`.
- `src/world.cpp:3434-3437` — `extra_time_and_sudden_death`; `src/world.h:1159-1167` — `getMapTime`, `getTimeLeft`, `getExtraTimeLeft`, `reset_time`.
- `src/world.cpp:1656-1675` — `ServerWorld::reset`; `src/world.cpp:1712-1724` — `load_map` (`map_start_time = frame`); `src/world.cpp:1798-1805` — `start_game`.
- `src/server.cpp:193-214` — `ctf_game_restart`; `src/server.cpp:565-671` — `server_next_map`; `src/server.cpp:1575-1596` — fim do placar e `start_game`.

## Algoritmo
1. **Respawn** (`respawnPlayer`):
   - Sem pontos de spawn no time, `respawn_to_base` é desligado.
   - Com `respawn_to_base`: `lastspawn` do time avança (volta a 0 no fim) **antes** de ser usado — o primeiro jogador do mapa nasce no ponto 1.
   - Senão, com áreas de respawn: área `rand() % n`, depois `x = x1 + rand() % (int(x2 − x1) + 1)` e `y` igual, repetindo até ficar fora das paredes (raio 15).
   - Senão, sala aleatória: matriz de salas ocupadas por qualquer jogador usado (vivo ou morto, inclusive o próprio); `runaway = 400`; sorteia `ridx = rand() % (w·h)` enquanto `runaway-- > 200 && ocupada`; `x = 15 + rand() % 442`, `y = 15 + rand() % 324`; se fora das paredes, aceita; senão repete enquanto `runaway-- > 0` (esgotado, fica a última posição).
   - Estado: velocidade 0, `start_health`, `start_energy`, megabonus 0, `start_weapon`, shield = `start_shield` (bool → 1 acerto), power/turbo/shadow com os tempos iniciais a partir de agora, `start_deathbringer`, efeito de deathbringer zerado, `next_shoot_frame = start_take_damage_frame = frame + iround(spawn_safe_time × 10)`, `attackOnce` falso, vivo, `stats.spawn(agora)`.
2. **Morte → espera:** `resetPlayer` calcula `[respawn_time + penalidade, extra]`; base negativa passa para o extra; frames = `iroundBound(× 10)`.
3. **Contagem** (após a física): cada morto desconta 1 frame da base, ou, zerada, do extra. A fila de cada time é ordenada por (extra, base); intercala-se sempre o menor extra dos dois times; quem sai da fila tem seu extra descontado do primeiro do outro time e zerado; nasce quem tem base e extra zerados (e não espera o cliente carregar o mapa).
4. **Limite de tempo** (fim do frame, só com 2+ jogadores e `time_limit > 0`; `timeLeft = time_limit − mapTime` em frames), cadeia de `else if`:
   - aviso de 5 min (limite ≥ 10 min), 1 min (≥ 2 min), 30 s (≥ 1 min) no frame exato;
   - `timeLeft == 0` e (placar diferente ou sem prorrogação e sem morte súbita): fim por tempo;
   - `extraTimeLeft == 0` com `extra_time > 0`: novo período se ainda há períodos e o placar está empatado; senão fim da prorrogação;
   - `timeLeft == 0`: período volta a 1 e avisa o fim do tempo normal (com ou sem morte súbita).
5. **Morte súbita:** depois do tempo normal (`timeLeft < 0`), qualquer captura ou ponto de posse encerra (mesmo teste do limite de capturas).
6. **Fim de partida** (`server_next_map`): roda **no meio do frame** em que aconteceu (captura na pós-física, ponto de posse ou limite de tempo). Finaliza as estatísticas, escolhe o próximo mapa (votos/rotação), carrega-o (`map_start_time = frame`, bandeiras do mapa, `lastspawn` zerados), `ctf_game_restart` (bandeiras na base, balanceamento de times se configurado, `reset`: placar e estatísticas zerados preservando o início de cada jogador, sem itens/foguetes/explosões, período 1, e cada jogador vai a um spawn e morre sem espera, com `respawn_to_base`). O resto do frame continua no mapa novo (todos mortos). Durante o placar (`game_end_delay`, 5 s, estendido até 15 s esperando clientes) o servidor não simula; depois `start_game`: `map_start_time = frame` e power-ups iniciais (`check_powerup_creation(true)`).

## Na sim
- `respawnPlayer`, `resetWorld` (= `ServerWorld::reset`), `changeMap(map)` (carga + `ctf_game_restart`, sem balanceamento) e `startGame`.
- `hooks.gameOver(reason)` é síncrono: o servidor de sala (OG-040) escolhe o mapa e chama `changeMap` dentro dele, reproduzindo o original. `world.gameOver` guarda o motivo até o `startGame`.
- Eventos para rede/UI: `playerSpawned`, `timeWarning`, `normalTimeOut`, `extraTimePeriodStarted`, `gameOver`.
- Votação de mapas, placar, gravação e balanceamento ficam no servidor de sala.

## Casos-limite
- `getTimeLeft` é `uint32 − int` convertido para `int`: equivale à subtração com sinal.
- `current_extra_time_period` é privado e não estava no trace; o trace agora grava `extraTimePeriod` (calculado pelos getters públicos) e `lastSpawn`.
- O `-bottest` reinicia o mapa no frame ~151; os limites de tempo dos traces contam a partir daí.
- Slots vazios do original têm `dead = false`; a diretiva `suicide` do trace ignora PIDs vazios.

## Vetores de teste
- Traces: `respawn-order` (4 suicídios simultâneos com tempos de equilíbrio; resync e free), `match-time-win` (fim do tempo 1 a 0 e reinício), `match-sudden-death` (captura na morte súbita encerra no meio do frame), `match-extra-time` (aviso de 30 s, tempo normal empatado, segundo período, fim da prorrogação e reinício), `bots-match` (600 frames com 14 respawns, 2 capturas e 3 devoluções; resync e free), além de `rocket-hit` e `pup-drop-at-death` agora completos.
- `lifecycle.test.ts`: pontos de spawn em rodízio, áreas de respawn, sala desocupada, estado inicial e proteção de spawn, tempos de equilíbrio, reinício do mapa e todos os ramos do limite de tempo.
