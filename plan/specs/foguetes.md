# Spec: tiro e foguetes
Card: OG-022 · RNs: RN-TIR-01..04, RN-TIR-06, RN-TIR-08, RN-TIR-09

## Fonte
- `src/world.cpp:3180-3200` — tiro em `simulatePlayerPostPhysics`.
- `src/world.cpp:2402-2460` — `getFreeRocket`, `ServerWorld::shootRockets`, `deleteRocket`.
- `src/world.cpp:1342-1410` — `WorldBase::addRocket` e formações em `WorldBase::shootRockets`.
- `src/world.cpp:2826-3050` — movimento dos foguetes no laço de física (OG-021); `rocketHitWall`/`rocketOutOfBounds` liberam o slot.

## Algoritmo
1. Atira se `attack` ou `attackOnce` estiver ativo e `frame ≥ next_shoot_frame`. A energia cai `shooting_energy_base`; se ficar negativa vira 0 e sai **um** foguete; senão, cada foguete extra (até o nível da arma) custa `shooting_energy_per_extra_rocket` enquanto houver energia para ele.
2. `next_shoot_frame = frame + iround(intervalo × 10)`: `shoot_interval_with_energy` se sobrou energia, senão `shoot_interval`. Atirar revela quem está com shadow (alpha 254). `attackOnce` é zerado a cada frame.
3. O tiro parte da posição **truncada para inteiro** (como o cliente recebe) e soma 1 tiro ao jogador e ao time, independentemente do número de foguetes.
4. Cada foguete pega o **primeiro slot livre** dos 256 (tabela cheia: `rand() % 256`).
5. **Formação** (nível 1–9): 1, 2 ou 3 à frente, mais desvios em oitavos de volta (±1 = 45°): `[1], [2], [3], [2;±1], [3;±2], [2;±1±2], [3;±2±3], [2;±1±2±3], [3;±1±2±3]`. Paralelos: 2 à frente → deslocamentos −1/+1; 3 à frente → 0/−2/+2, em unidades de `PLAYER_RADIUS + ROCKET_RADIUS − 2` = 17 px.
6. **Criação:** o deslocamento lateral é um movimento de 1 frame (se bater na parede antes, o foguete morre). Depois, velocidade `rocket_speed` na direção da arma e avanço de `15 / rocket_speed` frames, também testando parede. Fora da sala → removido.
7. Foguetes não trocam de sala: ao sair dela são removidos.

## Vetores de teste
Traces `shoot-level1` (80 frames, nível 1, girando a arma) e `shoot-level9` (48 frames, nível 9 em 5 direções até esgotar a energia), comparando todos os foguetes (slot, dono, time, posição, velocidade, direção), `nextShootFrame`, `attackOnce` e tiros, nos modos `resync` e `free`.
