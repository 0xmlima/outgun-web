# Spec: colisões entre jogadores
Card: OG-023 · RNs: RN-FIS-10, RN-FIS-11

## Fonte
- `src/world.cpp:2703-2733` — `WorldBase::executeBounce(pl1, pl2)`: troca das componentes na linha dos centros, força do quique e redução de 10%.
- `src/world.cpp:2545-2683` — `ServerWorld::playerHitPlayerCallback`.
- `src/world.cpp:2826-3050` — detecção da próxima colisão no laço por sala (OG-021); jogadores protegidos pelo spawn não colidem.

## Algoritmo
- `player_collisions no`: não há colisão (preset Clássico). `normal`: quique com força 1. `special`: quique e efeitos abaixo.
- **Quique:** decompõe as velocidades na linha dos centros; `newk1 = k1 + (−k2 − k1) × força1` (o mesmo para o outro jogador); velocidade final × 0,9; limite rígido de velocidade (RN-FIS-07).
- **Portadores aliados** que se tocam ficam registrados no frame, para captura com `carry_own_team_flag`.
- **Efeitos de `special`**, com a velocidade relativa dividida por `max_run_speed` (27,1875 fixo no servidor):
  - **shadow:** bater num inimigo revela (alpha 254); encostar num aliado sem shadow, tendo mais de 3 s restantes, dá 3 s de shadow a ele;
  - **turbo:** arremessa o outro (força 2);
  - **deathbringer:** o portador infecta o inimigo sem deathbringer por 1 s (trava a arma pelo mesmo tempo) e os dois são arremessados;
  - **shield:** sem infecção e contra quem não tem deathbringer, causa dano `trunc(60 × v)` e trava a arma de quem é atingido; com shield dos dois lados, ambos perdem shield e energia. A checagem do shield do segundo jogador é refeita depois, causando dano mútuo, como no original;
  - **power sem shield** contra inimigo sem shield nem power: dano `trunc(80 × v)` ("humilhação").

## Vetores de teste
Traces `collide-normal`, `collide-special-shield`, `collide-special-power`, `collide-special-turbo-shadow` (shadow compartilhado com aliado, arremesso por turbo, revelação) e `collide-special-deathbringer` (infecção e dano contínuo), comparando o estado completo nos modos `resync` e `free`.
