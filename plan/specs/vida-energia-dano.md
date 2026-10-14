# Spec: vida, energia, dano e shield
Card: OG-024 · RNs: RN-VID-01..05, RN-TIR-05, RN-TIR-07, RN-PTS (morte)

## Fonte
- `src/world.cpp:3076-3120` — `doRegenerate`, `regenerateHealthOrEnergy`, `degradeHealthOrEnergyForRunning`.
- `src/world.cpp:3200-3250` — vida e energia em `simulatePlayerPostPhysics` (degradação do deathbringer, megahealth, limites).
- `src/world.cpp:2274-2370` — `damagePlayer` (shield, trava da arma, frags de morte, defesa e ataque).
- `src/world.cpp:2228-2272` — `resetPlayer`, `killPlayer`.
- `src/world.cpp:2510-2543` — `rocketHitPlayerCallback`.
- `src/world.cpp:4069-4211` — `Statistics` (mortes, sequências, tempo de vida).

## Algoritmo
- **Regeneração** (fora do efeito de deathbringer), com 0,1 s por frame consumido em ordem: vida 0→100, energia 0→100, energia 100→200, vida 100→200, energia 200→máx, vida 200→máx; cada faixa só começa se o valor já estiver nela, e o tempo que sobra passa para a próxima. Com deathbringer, os máximos ficam limitados a `pup_deathbringer_*_limit`.
- **Correr** gasta energia (`run_energy_degradation`/s); o que faltar sai da vida até `min_health_for_run_penalty`.
- **Megahealth:** até 5 rodadas por frame de +1 vida e +1 energia enquanto houver bônus; o bônus zera quando os dois estão no máximo.
- **Limites:** vida ≤ máximo; energia em [0, máximo].
- **Dano:**
  - ignorado se o alvo está morto ou protegido no spawn; revela shadow;
  - com shield por energia (`pup_shield_one_hit 0`), o dano sai da energia e o shield cai quando ela zera; com shield por acertos, cada acerto consome um;
  - sem shield, sai da vida, e a arma trava `hit_stun_time` (exceto em colisão).
- **Morte (vida ≤ 0):**
  - atacante inimigo: +1 frag; aliado: −2;
  - +1 de defesa se um aliado do atacante carrega bandeira na sala;
  - senão +1 se a bandeira do atacante está no chão da sala (defesa);
  - senão +1 se a bandeira do alvo está no chão da sala (ataque);
  - portador inimigo morto: +1 frag e +1 portador abatido; portador aliado: −1;
  - estatísticas de kill/morte; o tempo da morte é **truncado para inteiro** (`static_cast<int>(get_time())`), como no original.
- **killPlayer:** ponto negativo de ranking (+1 se largou bandeira); `resetPlayer` zera vida e energia, tira power/turbo/shadow, zera a velocidade e programa o respawn: `iround(respawn_time × 10)` frames mais o extra de balanceamento.
- **Foguete acertando:**
  - dano `rocket_damage` (× `pup_power_damage` se power; × `friendly_fire` se aliado, truncando para inteiro);
  - estatísticas: acerto só contra inimigo; tiro recebido sempre;
  - empurrão `vel_foguete × 15 / rocket_speed` (× `friendly_fire` se aliado) se o alvo sobreviveu; o foguete some.

## Vetores de teste
Todos os traces cobertos comparam o estado completo do jogador (`combatFields`): vida, energia, megabonus, arma, shield, power-ups e tempos, trava e proteção, respawn e todas as estatísticas, além de foguetes e estatísticas dos times. Cenários específicos: `rocket-hit` (até o respawn, OG-029), `shield-rockets` (shield por energia) e `shield-hits` (`pup_shield_one_hit 2`); `move-run` exercita corrida, energia e vida.
