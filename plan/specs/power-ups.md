# Spec: power-ups
Card: OG-025 · RNs: RN-PUP-01..09 (modo Casual; o Ranked não tem power-ups, RN-MOD-02)

## Fonte
- `src/world.cpp:1494-1576` — `PowerupSettings` (chances, quantidades em % das salas, `addTime`).
- `src/world.cpp:1928-2040` — `drop_powerup`, `respawn_powerup`, `check_powerup_creation`.
- `src/world.cpp:2040-2215` — `game_touch_powerup`, `drop_worst_powerup`.
- `src/world.cpp:3122-3176` — expiração (turbo, power, shadow) e queda do alpha do shadow na pré-física.
- `src/world.cpp:3205-3215` — coleta por toque na pós-física; `src/world.cpp:3453` — reaparecimento no início do frame.

## Algoritmo
- **Quantidade:** mínimo = max(`pups_min`, nº de jogadores) limitado a `pups_max`. Porcentagens: `trunc((salas × % + 50) / 100)`, ao menos 1 se % > 0, no máximo 32. `check_powerup_creation` marca slots livres como "reaparecendo" em `tempo + pups_respawn_time`; é chamado depois de cada coleta.
- **Reaparecer:**
  - sorteia uma sala com `RoomCoords(rand() % w, rand() % h)`; **o primeiro `rand()` é o y**, porque o GCC avalia os argumentos da direita para a esquerda;
  - nas primeiras 100 tentativas rejeita salas com jogadores; até a 200ª, salas com outros power-ups;
  - posição `15 + rand() % (472 − 30)`, `15 + rand() % (354 − 30)`;
  - rejeita se tocar parede (a tentativa conta em dobro); depois de 300, desiste;
  - o tipo é sorteado por peso: `1 + rand() % soma`, subtraindo as chances na ordem shield, turbo, shadow, power, arma, megahealth (resto: deathbringer).
- **Coleta** (raio 15 + 15, fora do efeito de deathbringer), na ordem dos slots:
  - limite `pups_player_max` (megahealth não conta): ao pegar um tipo novo com o limite cheio, descarta o pior. Primeiro o temporizado que acaba antes, zerando o tempo (expira no próximo frame); depois deathbringer, shield, e por fim a arma volta a 1;
  - **shield:** N acertos ou 1 (por energia); vida mínima 100; +100 de energia até 200;
  - **turbo, shadow, power:** tempo restante (0 se não tinha) + `pup_add_time`, até `pup_max_time`; o shadow vai para o alpha mínimo;
  - **arma:** +100 de energia até 200; nível +1 até `pup_weapon_max`;
  - **megahealth:** +`pup_health_bonus` de bônus (RN-VID-05);
  - **deathbringer:** alterna com `pup_deathbringer_switch` (só para quem pegou); senão liga;
  - `pup_team_*`: o mesmo efeito para aliados vivos, sem compartilhamento recursivo. Depois o slot fica vazio e entra em `check_powerup_creation`.
- **Na morte** (`pups_drop_at_death`): sorteia entre shield, turbo/shadow/power com pelo menos `pup_add_time / 2` (divisão inteira) restantes e arma ≥ 2; o item cai na posição truncada, no primeiro slot livre.

## Vetores de teste
Cenários com a diretiva `pup` (power-ups posicionados): `pup-collect-all`, `pup-limit`, `pup-stack-time`, `pup-team-share`, `pup-respawn` (reaparecimento aleatório) e `pup-drop-at-death`, mais `shoot-level9`, que agora vai até o fim com uma coleta no frame 248. A comparação de itens olha tipo e posição dos reais e tipo e tempo dos que vão reaparecer; posição e tempo antigos guardados em slots são estado oculto.
