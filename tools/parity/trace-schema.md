# Golden traces: cenários e formato

Card OG-003. O oráculo (Outgun original + `patches/001-trace.patch`) roda um cenário em modo `-bottest` e grava, para cada frame, o estado completo **antes** e **depois** de `ServerWorld::simulateFrame`, o relógio do servidor e os `rand()` consumidos pela simulação. A simulação TS (`packages/sim`) é comparada com isso pelo pacote `@outgun/parity`.

## Gravar um cenário novo (≈ 3 minutos)

1. Crie `tools/parity/scenarios/NOME.txt` (copie um parecido; veja o formato abaixo).
2. Rode `pnpm oracle trace NOME` (a imagem precisa existir: `pnpm oracle build`).
3. Confira o resultado com `pnpm --filter @outgun/parity test` e versione `tools/parity/traces/NOME.jsonl.gz`.

## Formato do cenário

Uma diretiva por linha; `#` inicia comentário.

| Diretiva                               | Significado                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `map NOME`                             | Mapa (de `maps/`; se só existir em `cmaps/`, é copiado dentro do container)                                                                                                                                                                                                                              |
| `bots N`                               | Número de bots no servidor (os jogadores do cenário são bots)                                                                                                                                                                                                                                            |
| `gamemod CHAVE VALOR`                  | Override do gamemod (preset Clássico = `config/gamemod.txt`)                                                                                                                                                                                                                                             |
| `seconds N`                            | Limite de tempo de relógio para a execução (padrão 120)                                                                                                                                                                                                                                                  |
| `start F`                              | Primeiro frame gravado (use ≥ 200: o `-bottest` reinicia o jogo no frame 100)                                                                                                                                                                                                                            |
| `frames N`                             | Quantos frames gravar; o servidor encerra em seguida                                                                                                                                                                                                                                                     |
| `seed S`                               | `srand(S)` no início da gravação                                                                                                                                                                                                                                                                         |
| `players P...`                         | PIDs controlados pelo roteiro: ignoram suicídio, largar bandeira, troca de time e tiro do bot                                                                                                                                                                                                            |
| `at F PID CAMPO VALORES`               | No frame F, antes da simulação (PID vazio é ignorado): `pos RX RY X Y`, `vel VX VY`, `health H`, `energy E`, `weapon W`, `gundir D` (oitavos, 0 = direita, sentido horário), `shield N`, `turbo S`, `power S`, `shadow S` (segundos), `deathbringer 0/1`                                                 |
| `input F PID CONTROLES ATIRA [LARGAR]` | A partir do frame F (até a próxima linha `input` do mesmo PID): bits de controle (cima 1, baixo 2, esquerda 4, direita 8, correr 16, strafe 32), botão de tiro 0/1 e tecla de largar bandeira 0/1. Aplicado com a mesma semântica da rede (`incoming_client_data`, `data_fire_on/off`, `data_drop_flag`) |
| `pup F SLOT TIPO RX RY X Y`            | No frame F, põe um power-up no slot (`TIPO` 0–6; 7 remove)                                                                                                                                                                                                                                               |
| `pupclear F`                           | No frame F, remove todos os power-ups                                                                                                                                                                                                                                                                    |
| `suicide F PID`                        | No frame F, o jogador se mata (`data_suicide`)                                                                                                                                                                                                                                                           |
| `flagreset F`                          | No frame F, os portadores largam e todas as bandeiras voltam à base (os bots jogam livremente antes do `start` e podem estar com bandeiras)                                                                                                                                                              |

Com `bots 2` e 16 vagas, os bots ocupam os PIDs 0 (vermelho) e 8 (azul). Com mais bots a divisão entre os times varia de uma gravação para outra (o PID 0 é sempre vermelho); `input` para PIDs vazios é ignorado, então dá para listar todos. Os PIDs usados aparecem em `pre.players` do primeiro frame. O `-bottest` reinicia o mapa no frame ~151 (`mapStartTime`): limites de tempo contam a partir daí.

## Formato do trace (`.jsonl.gz`)

Primeira linha (`type: "header"`): `version` (1), `seed`, `startFrame`, `maxplayers`, `mapTitle`, `mapCrc` (CRC-16 do mapa, igual ao `GameMap.crc` do port), `gamemod` (texto completo do gamemod usado) e `script` (texto do cenário).

Demais linhas (`type: "frame"`): `frame`, `pre`, `rand`, `post`.

- `rand`: valores de `rand()` chamados **pela thread da simulação** durante o frame, em ordem (`-Wl,--wrap=rand`). Outras threads (bots) também usam `rand()` e alteram o estado global da glibc; por isso a simulação TS consome os valores gravados (`RecordedRng`) em vez de uma semente.
- `pre`/`post`: estado do mundo. Tipos completos em `tools/parity/src/trace.ts`:
  - `frame`, `time` (valor de `get_time()` do servidor; ver D-09), `mapStartTime`, `extraTimePeriod` e `lastSpawn` (último ponto de spawn de cada time; os dois a partir do OG-029);
  - `players[]` (só os usados): posição `[sala x, sala y, x, y]`, velocidade, controles, direção da arma (oitavos), tiro, vida, energia, arma, power-ups e seus tempos, deathbringer, frames de tiro/respawn, chave de largar bandeira e `stats` (todas as estatísticas de `Statistics`);
  - `rockets[]` (ativos, com `id` do slot), `powerups[]` (não vazios; `kind` 8 = reaparecendo);
  - `teams[2]` (placar, estatísticas do time, bandeiras e capturas), `wildFlags[]`, `deathbringers[]`.

## Como comparar

`runParity(trace, adaptador, opções)` (pacote `@outgun/parity`):

- modo `resync` (padrão): carrega o `pre` do original em todo frame, simula um frame e compara com o `post`. Isola a lógica do frame, inclusive quando bots mandam mensagens entre frames.
- modo `free`: carrega só o primeiro frame. Útil em cenários roteirizados sem eventos externos (teletransportes `at` no meio do roteiro e o reinício do mapa depois de um game over só funcionam em resync). Largar bandeira e `suicide` são reproduzidos pelo adaptador.
- Durante o placar de fim de partida o servidor não simula: os números de frame dão um salto e o `pre` seguinte já é o mapa reiniciado.
- `select`: recorta os campos comparados (cada card do épico E2 compara o que já implementou).
- tolerância absoluta padrão de `1e-9`; o relatório aponta o primeiro frame e o caminho do campo divergente (ex.: `players[pid=0].vel[0]`) e acusa `rand()` consumidos a mais ou a menos.

## Cenários versionados

| Cenário              | O que exercita                                                            |
| -------------------- | ------------------------------------------------------------------------- |
| `move-straight`      | aceleração, arrasto, atrito, quique em parede reta                        |
| `move-run`           | corrida, gasto de energia e regeneração                                   |
| `move-diagonal`      | normalização da diagonal, corrida na diagonal                             |
| `move-brake-turn`    | freada, curva, strafe, troca de direção da arma                           |
| `move-turbo`         | turbo e sua expiração                                                     |
| `bounce-triangle`    | quique em parede triangular (`cmaps/arena`)                               |
| `bounce-circle`      | quique em parede circular (`maps/coliseu`)                                |
| `wrap-edge`          | saída pela borda do mapa (mundo toroidal)                                 |
| `shoot-level1`       | tiro contínuo, intervalo, energia, direções                               |
| `shoot-level9`       | formação de 9 foguetes, energia esgotando                                 |
| `rocket-hit`         | dano, empurrão, trava da arma, morte e respawn                            |
| `flag-capture`       | pegar a bandeira inimiga e capturar                                       |
| `bots-match`         | 600 frames de partida livre com 6 bots (integração)                       |
| `flag-*`             | bandeiras: largar, devolver, assistência, selvagem, locks, posse (OG-027) |
| `respawn-order`      | ordem de respawn entre os times com tempos de equilíbrio                  |
| `match-time-win`     | fim do tempo com um time na frente e reinício do mapa                     |
| `match-sudden-death` | fim do tempo empatado e morte súbita na captura                           |
| `match-extra-time`   | avisos de tempo, prorrogação em dois períodos e fim                       |
