# Spec: movimento do jogador, quiques e troca de sala
Card: OG-021 · RNs: RN-FIS-01..07, RN-MAP-02, RN-TIR-10

## Resumo
Aceleração, arrasto e atrito por frame; movimento contínuo dentro da sala até o próximo evento (quique, colisão com foguete ou jogador); troca de sala com mundo toroidal.

## Fonte
- `src/world.cpp:1209-1275` — `applyPlayerAcceleration`.
- `src/world.cpp:2693-2738` — `executeBounce` (parede e jogador), `limitPlayerSpeed`.
- `src/world.cpp:2740-2825` — `applyPhysics`, `applyPhysicsToPlayerInIsolation`.
- `src/world.cpp:2826-3050` — `applyPhysicsToRoom`.
- `src/world.cpp:1636-1655, 2497-2510, 2685-2692` — callbacks do servidor.
- `src/commont.h:64-110`, `src/commont.cpp:134` — controles e direção; `src/world.h:387` — `GunDirection`.

## Algoritmo
1. **Aceleração** (antes de mover, para cada jogador vivo, por ordem de pid):
   - `accel × turbo_mul` com turbo; × `run_mul` correndo; × `flag_mul` se correndo com bandeira inimiga ou selvagem.
   - arrasto `vel × (1 − drag)`; atrito: zera se `|v| ≤ fric` ou `|v| < 0,001`, senão `vel × (1 − fric/|v|)`;
   - sob deathbringer, para aqui;
   - direção (diagonal ÷ √2), freio × `brake_mul`, curva × `turn_mul`; `vel += acc × accel`.
2. **Salas** na ordem x e depois y. Em cada uma, enquanto não acabar o frame:
   - calcula o próximo quique em parede, a próxima colisão jogador × foguete (ignorando foguetes amigos sem fogo amigo e o próprio foguete) e a próxima colisão jogador × jogador (se `player_collisions ≠ no`);
   - move todos até o evento, com margens de 0,001 para não encostar e mínimo de 0,01 para não quicar infinitamente;
   - quem sai da sala troca de sala, termina o frame sozinho na sala nova (`applyPhysicsToPlayerInIsolation`) e sai do laço;
   - foguetes que batem na parede chamam o callback;
   - resolve o evento: quique (inverte a componente normal e perde 5%), colisão de jogadores ou foguete acertando jogador.
3. **Troca de sala:** a borda cruzada primeiro decide o eixo; a posição sai do outro lado (`positiveModulo`); o tempo excedente é devolvido e reaplicado na sala nova.
4. Distância percorrida soma em `stats.movement` do jogador e do time.

## Divergências intencionais
Nenhuma na lógica. O relógio da web é determinístico (D-09). Os traces congelam o relógio do original durante cada frame (patch do oráculo), pois no original outras threads o avançavam alguns microssegundos no meio do frame, tornando expirações no limite (ex.: turbo) não determinísticas.

## Vetores de teste
Traces `move-straight`, `move-run`, `move-diagonal`, `move-brake-turn`, `move-turbo`, `bounce-triangle`, `bounce-circle` e `wrap-edge`, comparados em posição, velocidade e distância percorrida, nos modos `resync` e `free` (`tools/parity/src/movement.test.ts`).
