# Spec: constantes, unidades e aleatoriedade
Card: OG-004 · RNs: RN-MAP-01, RN-FIS-08

## Resumo
Valores globais do jogo, conversões numéricas com semântica do C++ e o gerador `rand()` da glibc, base de toda a simulação e dos testes de paridade.

## Fonte
- `src/commont.h:282-317` — tamanho da sala, raios, limites, π.
- `src/world.h:39` — raios de power-up e bandeira; `src/world.h:894` — `shot_deltax`.
- `src/utility.cpp:133-159` — `iround`, `iround_bound`, `positiveFmod`; `src/utility.h:355-367` — `sqr`, `positiveModulo`.
- `src/world.cpp:3091` — `timeLeft = .1` (frame de 0,1 s); `src/world.cpp:2250` — conversão segundos → frames com `iround_bound(t * 10.)`.
- glibc 2.24 `stdlib/random_r.c` (TYPE_3) e libstdc++ 6 `bits/stl_algo.h:4439` (`random_shuffle`), conferidos dentro do oráculo.

## Settings e constantes
| Nome | Valor | Origem |
|---|---|---|
| ROOM_WIDTH × ROOM_HEIGHT | 472 × 354 | `plw`, `plh` |
| PLAYER_RADIUS | 15 | commont.h |
| SHIELD_RADIUS_ADD | 9 | commont.h |
| ROCKET_RADIUS / POWER_ROCKET_RADIUS | 4 / 6 | commont.h |
| POWERUP_RADIUS / FLAG_RADIUS | 15 / 15 | world.h |
| SHOT_DELTA_X | 17 | `PLAYER_RADIUS + ROCKET_RADIUS - 2` |
| MAX_PLAYERS / MAX_ROCKETS / MAX_POWERUPS | 32 / 256 / 32 | commont.h |
| FRAME_SECONDS | 0,1 | 10 frames/s |

## Algoritmo
- `static_cast<int>(x)` → `Math.trunc(x)`.
- `iround(x)` → `x >= 0 ? trunc(x + 0.5) : trunc(x - 0.5)`; `iround_bound` satura em ±2³¹.
- `positiveModulo(v, m)` → `v >= 0 ? v % m : (m - 1) - ((-v - 1) % m)`.
- `positiveFmod(v, m)` → `fmod(m + fmod(v, m), m)`; em JS `%` sobre doubles é exatamente `fmod`.
- `srand(seed)`: semente 0 vira 1; `state[0] = seed` (int32); `state[i] = 16807·state[i-1] mod (2³¹−1)` pelo método de Schrage (`hi = word/127773`, `lo = word%127773`, `word = 16807·lo − 2836·hi`, soma 2³¹−1 se negativo); ponteiros `front = 3`, `rear = 0`; descarta 310 valores.
- `rand()`: `val = (state[front] + state[rear]) mod 2³²`; grava em `state[front]`; avança os dois ponteiros circularmente (31 posições); devolve `val >>> 1`.
- `random_shuffle`: para `i` de 1 a n−1, `j = rand() % (i + 1)`, troca `i` e `j` se diferentes.

## Posição no frame
Não se aplica. Observação para os próximos cards: `ServerWorld::simulateFrame` embaralha a ordem dos jogadores com `random_shuffle` **todo frame** (`src/world.cpp:3452`), antes de qualquer outro `rand()` do frame.

## Casos de borda
1. `srand(0)` equivale a `srand(1)`.
2. Semente acima de 2³¹ (ex. 4294967295) é tratada como int32 negativo no estado inicial.
3. Sem `srand`, a sequência é a de `srand(1)`.
4. `iround(-0.5) = -1`; `iround(0.5) = 1`.

## Divergências intencionais
Nenhuma. Em produção a sala pode usar outro `Rng` (melhor qualidade); a interface é a mesma.

## Vetores de teste
`packages/sim/src/__fixtures__/glibc-rand.json`, gerado por `pnpm oracle fixture rng` (`tools/parity/fixtures/rng.cpp`): 7 sementes × 1.000 valores (10.000 para a semente 42), sequência sem `srand`, e 32 embaralhamentos de 1 a 32 elementos com a semente 7.
