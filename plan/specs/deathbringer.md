# Spec: deathbringer
Card: OG-026 · RNs: RN-DB-01..05

## Fonte
- `src/world.h:809-830`, `src/world.cpp:1421-1429` — `DeathbringerExplosion` (raio, expiração, máscara).
- `src/world.cpp:2258-2272` — `killPlayer`: cria a explosão se o morto carregava deathbringer; respawn com `waiting_time_deathbringer` extra.
- `src/world.cpp:3465-3512` — limpeza das expiradas e jogadores atingidos, em `simulateFrame`, logo após a pré-física.
- `src/world.cpp:3160-3172` — efeito contínuo na pré-física (3 de dano por frame; 12 com shield).
- `src/world.cpp:3203-3208` — degradação do portador acima dos limites; `src/world.cpp:2593-2610` — infecção por colisão (OG-023).

## Algoritmo
1. **Explosão:** na posição da morte, com o time do dono; raio `100·t` (t em segundos desde a explosão) até 1 s, depois `100 + 800·(t − 1)²`; expira após 18 frames. As expiradas são removidas do início da lista.
2. **Acerto**, para cada jogador vivo na sala da explosão (aliados só com `friendly_deathbringer > 0`):
   - a mais de `raio + 60` do centro: marca o bit na nova máscara ("fora") e segue;
   - a menos de `raio − 10` sem o bit na máscara anterior (já estava dentro ou acabou de chegar): ignora;
   - já sob efeito ou protegido pelo spawn: ignora;
   - senão: duração `pup_deathbringer_time × (aliado ? friendly_deathbringer : 1) × (9000 + rand() % 2000) / 10000`, arma travada pelo mesmo tempo, velocidade 40 para fora do centro e atacante registrado.
3. **Efeito:** sob deathbringer o jogador não acelera, não regenera, não pega power-ups nem bandeiras, e perde 3 de vida por frame (12 do shield).
4. **Portador:** vida e energia acima de `pup_deathbringer_*_limit` caem 2,5/s; regeneração limitada a esses valores; o item só sai no respawn.

## Vetores de teste
`db-explosion` (inimigo atingido pela expansão do anel) e `db-friendly` (aliado do portador com metade do tempo; inimigo com shield), além de `collide-special-deathbringer` (infecção). Estado completo, nos modos `resync` e `free`.
