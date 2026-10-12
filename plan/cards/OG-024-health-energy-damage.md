# OG-024 — Vida, energia, dano e shield

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S3 |
| Status | Em revisão |
| Dependências | [OG-022](OG-022-rockets.md) |
| Regras de negócio | RN-VID-01, RN-VID-02, RN-VID-03, RN-VID-04, RN-VID-05, RN-TIR-05, RN-TIR-07 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero que vida e energia regenerem e sejam gastas como no original, para equilibrar correr, atirar e sobreviver.

## Contexto e referências no original
- `regenerateHealthOrEnergy`, `degradeHealthOrEnergyForRunning` (`world.cpp:3087-3120`).
- `damagePlayer` (`world.cpp:2274-2370`).
- Megahealth e limites em `simulatePlayerPostPhysics`.

## Escopo
- Regeneração por faixas com consumo do tempo do frame.
- Penalidade de corrida.
- Dano com shield (energia/acertos), hit stun, friendly fire.
- Megabonus 5/frame.

## Critérios de aceite
- [x] Testes unitários para cada faixa de regeneração e transições. _(cobertos pela paridade frame a frame: regeneração, corrida, gasto do tiro e dano aparecem nos 14 traces cobertos)_
- [x] Traces de dano/morte idênticos.

## Notas técnicas
- —

## Notas de implementação
- **Spec:** `plan/specs/vida-energia-dano.md`.
- **Código** (`ServerSim` em `packages/sim/src/world/server.ts`): `damagePlayer` (shield nos dois modos, trava da arma, frags de morte com defesa e ataque de bandeira e portadores), `killPlayer`/`resetPlayer` (respawn programado), `rocketHitPlayer`, `regenerateHealthOrEnergy`, `degradeHealthOrEnergyForRunning`, megahealth e limites em `postPhysics`, além das estatísticas (`addKill`, `addDeath`, `statsKill`).
- **Peculiaridade preservada:** na morte, o tempo vai truncado para inteiro (`static_cast<int>(get_time())`), afetando o tempo de vida nas estatísticas.
- **Paridade:** a cobertura passou a comparar o **estado completo** do jogador e dos times (`combatFields`) em todos os traces cobertos. Novos cenários `shield-rockets` e `shield-hits`; `rocket-hit` até o frame 229 (o respawn no frame 230 é do OG-029). Todos idênticos nos modos `resync` e `free`.
- Branch: `og-024-health-energy-damage`.
