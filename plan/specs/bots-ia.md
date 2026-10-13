# Spec: IA dos bots (navegação, combate e decisões)
Card(s): OG-051, OG-052, OG-053 · RNs: RN-BOT-02 · Base: [bots-areamap.md](bots-areamap.md) (OG-050)

## Resumo
O bot do original é um cliente completo (`Robot : ClientBase`) que recebe os frames do servidor por
uma conexão local com ping simulado, mantém o seu `ClientWorld` (`fx`) e a cada frame recebido decide
os controles (`RobotMain`) e o botão de tiro. A web porta a decisão linha a linha (`@outgun/bots`) e a
alimenta com uma visão (`BotView`) equivalente ao `fx`.

## Fonte
- `src/robot.h:38-245` — estado do bot (`destinationType`, `destination`, `immediateDestination`, `freeWalkTarget`, `botPrevFire`, `enemiesInRoom`, `last_seen`, `myGundir`, `futureMe`/`myPos`, `flagsIgnored`, tabelas).
- `src/robot.cpp:84-125` — explosões (`explosionInRoom`, `imminentExplosionHere`, `dangerousExplosionInNeighbor`), `moreDefensive`.
- `src/robot.cpp:126-160` — `IsBehindWall`, `ScanDir`, `WallHitPosition`.
- `src/robot.cpp:161-654` — combate: `TryAimTradTurning`, `GetDir`, `GetDangerousRocket`, `GetEasyEnemy`, `GetDangerousEnemy`, `GetNearestEnemy`, `TryAimFreeTurning`, `GetHitTime`, `GetHitTeammateTime`, `NeedShootFreeTurning`, `ShootAtDoorTradTurning`, `NeedShootTradTurning`, `predictDistanceFromRocket`, `EscapeRocket`, `EscapeExplosion`, `Aim`.
- `src/robot.cpp:655-796` — navegação: `FreeDir`, `MoveDirNoAggregate`, `MoveDir`, `FreeWalk`, `MoveIndirectlyTowards`, `MoveToNoAggregate`, `MoveTo`.
- `src/robot.cpp:797-975` — `GetPowerup`, `captureOnFlag`, `pickUpFlag`, `GetFlag`, `Teams`, `AmILast`, `Escape`, `FollowFlag`.
- `src/robot.cpp:976-1159` — `BuildMap`, `BuildDistanceTable`, `setDestination`, `MoveToDestination`, `nearestDoor`, `MoveToDoor`.
- `src/robot.cpp:1160-1659` — `flagIgnored`, `EnemyHasUnseenFlags`, `ChooseDestination`, `IsMassive`, `HaveFlag`, `IsFlagAtBase`, `Target*`, `IsMission`, `updateUnknownPosition`.
- `src/robot.cpp:1660-1905` — `getRobotControls`, `RobotMain`.
- `src/robot.cpp:1906-2112` — cliente virtual: `bot_start`, `set_ping`, mensagens de time ("d"/"a"), `bot_send_frame`, `bot_loop` (uma decisão por frame recebido, `clearModifiersIfIdle`).
- `src/server.cpp:1955-2005` — thread dos bots: todos os bots num laço, `bot_loop` de cada um em ordem.
- `src/world.cpp:932-944` — `ClientPlayer::setPosition`; `src/world.cpp:3737-3749` — `extrapolateSinglePlayerPosition`.
- `src/world.cpp:1171-1188` — `getTimeTillCollision(PlayerBase, Rocket)`.
- `src/world.cpp:remove_team_flags` — o cliente apaga também as bases do seu mapa.

## Settings e constantes
| Nome | Valor | Uso |
|---|---|---|
| `FADEOUT` | 50 frames | posição de inimigo esquecida |
| `roomToRoomBaseDistance` | 1000 | ver bots-areamap.md |
| `bot_ping` | 300 ms (setting) | atraso da conexão local; `averageLag = (clFrameSent − clFrameWorld) + 0,5` |
| limiar de mira (8 direções) | `1,3 · PLAYER_RADIUS` = 19,5 | ver Divergências |
| `thinkAheadFrames` | 10 | `GetDangerousRocket` |
| `safetyRoomMul` | 4 | raio de colisão `(PLAYER_RADIUS + ROCKET_RADIUS) · 4` |
| `maxPredictionFrames` | 10 | `predictDistanceFromRocket` |
| `playerPosAccuracy` | `plw / 0xFFF / 2` | descontado do raio na extrapolação |
| giro livre | teto π/2 por frame, ruído ±70 % (cúbico), atira se erro ≤ π/8 | `RobotMain` |

Settings do servidor lidas pelo bot (pela visão): física (`fric`, `drag`, `accel`, multiplicadores, `rocket_speed`, `friendly_fire`, `friendly_db`, `allowFreeTurning`, `max_run_speed` do cliente = 29,5), regras de bandeira em vigor (`carry_own_team_flag`, `capture_away_from_base`, `lock_*_in_effect`, `capture_on_*_in_effect`) e `see_minimap_player_properties`.

## Algoritmo
Cada função é portada na mesma ordem de operações do C++ (inclusive `rand()`); os pontos que mudam o
resultado:
1. **`RobotMain`**: mortos voltam à preferência `defendingAfterDeath`; se o mapa não está pronto, o bot está morto ou fora do mapa: `myGundir = −1`, esquece o passeio, solta o tiro e devolve controles vazios. Senão `futureMe` = eu extrapolado com os controles pendentes (`controlHistory[clFrameWorld+1 .. clFrameSent]`, o último por 1,5 frame; sem pendentes, o último enviado por 0,5), `myPos = futureMe.pos`; `getRobotControls`; a direção dos controles (sem strafe) vira `myGundir`; decide o tiro (8 direções: `NeedShootTradTurning`; se a direção de tiro é a anterior, liga strafe; senão troca os controles por `fromDirection(dir)` — sem correr); `clearModifiersIfIdle`.
2. **`getRobotControls`** (ordem fixa): marca a sala atual como vista; com shadow próprio, todas as salas vistas há ≤ 10 frames; amigo atualizado pelo minimapa duas vezes na mesma sala em ≤ 20 frames marca a sala; inimigos fora de vista → `updateUnknownPosition`; perdeu o último inimigo da sala → novo passeio; recalcula `flagsIgnored` (times 0, 1, 2, em ordem; cada uma monta a tabela `Def`); valida `last_seen`; foguete perigoso (se não amontoado) → foge; explosão → foge; bandeira na área → pega/captura; `ChooseDestination`; escolhe alvo (missão: só perigoso; com alvo: troca por um fácil; sem: o mais perto); sem missão importante e com alvo → `Aim`; power-up; `Escape`; `MoveToDestination`; `FollowFlag`; `FreeWalk` (sem alvo: sem correr).
3. **`FreeWalk`**: `Coords(rand() % S_W, rand() % S_H)` — o GCC sorteia **y antes de x**.
4. **`MoveToDestination`**: vizinho com distância ≤ a atual; com bandeira, evita áreas com inimigos > amigos + 1; mantém o vizinho anterior se ainda é bom; senão sorteia entre os bons (`rand() % n`, só se n > 0).
5. **Tabelas**: `TargetNearest` monta `Main` (eu, peso de respawn) a cada chamada; `setDestination` só remonta `Destination` se o destino mudou; descritor sem time (ver bots-areamap.md).
6. **`IsFlagAtBase`/`TargetNearestBase` com time 2**: o original indexa `map.tinfo[2]`, fora do vetor; pelo layout de `Map` isso é `map.wild_flags`. A web usa as bases selvagens explicitamente.
7. **Bases no cliente**: bandeiras removidas pelo servidor (`remove_flags`, ex.: `capture_on_team_flag 0` ou `lock_team_flags`) somem também das bases do mapa do cliente; `random_wild_flag` acrescenta. A visão do bot guarda as suas próprias bases (`BotView.bases`).

## Posição no frame
Fora da simulação: o bot decide ao receber um frame do servidor, e os controles chegam ao servidor
com o atraso de `bot_ping` (como de um cliente remoto). No `-bottest` do original todos os bots
decidem em sequência numa thread própria, uma vez por frame.

## Casos de borda
1. `last_seen` de um jogador que saiu, trocou de time ou morreu é esquecido no início da decisão.
2. `updateUnknownPosition` com várias saídas possíveis não adivinha; sem nenhuma, esquece (`posUpdated = frame − FADEOUT`).
3. `GetHitTeammateTime` só conta com `friendly_fire ≠ 0`; jogadores mortos ou fora da sala nunca são acertados.
4. `predictDistanceFromRocket` com velocidade relativa nula: divisão por zero → `NaN`, o laço segue (igual ao C++).
5. Giro livre: `gunDir.adjust(actualDiff)` soma **radianos** a uma direção em oitavos (bug do original, preservado).
6. Mais bandeiras que bases (`random_wild_flag`): o original lê `bases[fi]` fora do vetor; a web trata base ausente como "fora da base" (OG-053).

## Divergências intencionais
- **D-30 — limiar de mira fixo**: no original o limiar de `TryAimTradTurning` é uma variável `static` local, calculada uma vez por processo na primeira mira de qualquer bot (`1,3·R + 0,7·shot_deltax·(foguetes − 1)`). Como os bots começam com a arma 1, na prática vale 19,5; a web fixa esse valor. Confirmado com o oráculo: com o limiar de 2 ou 3 foguetes surgem centenas de divergências; com 19,5, nenhuma.
- **Tabelas de distância por bot e AreaMap compartilhado** (D-29, bots-areamap.md).
- **`gunDir` no giro livre** difere do original na 15ª casa decimal (atan2/cos/sin do V8 × glibc com `-ffast-math`); tolerância 1e-9.

## Vetores de teste
Patch `tools/parity/patches/002-bottrace.patch`: com a diretiva `bottrace` no cenário, o oráculo grava
em `NOME.bots.jsonl.gz`, para cada decisão de cada bot, a visão do cliente (jogadores com
`posUpdated`/minimapa, foguetes, power-ups, bandeiras, bases do cliente, explosões, `enemies_seen_frame`),
o estado do bot, os controles pendentes, os `rand()` da thread dos bots e o resultado (controles,
estado depois). `packages/bots/src/parity.test.ts` refaz cada decisão em modo resync:

| Cenário | Mapa | O que exercita | Decisões | Resultado |
|---|---|---|---|---|
| `bots-ai-outgun1` | outgun1 | 6 bots, padrão | 3.589 | idêntico |
| `bots-ai-verde` | verde | selvagem, captura fora da base, levar a própria, minimapa | 4.784 | idêntico |
| `bots-ai-freeturn` | 3x2 | giro livre, fogo amigo 50 %, colisões, só selvagem | 3.588 | idêntico (gunDir ±1e-15) |
| `bots-ai-ksii` | ksii | áreas de respawn, 10 bots | 5.980 | idêntico |
| `bots-ai-deathbringer` | outgun1 | só deathbringer, deathbringer amigo | 4.785 | idêntico |

Navegação (OG-051): `navigation.test.ts` — sozinho, com destino fixo e a física da sim, o bot chega a
todas as áreas alcançáveis de outgun1 (1.260 pares), verde (110) e ksii (240).
