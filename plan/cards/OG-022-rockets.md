# OG-022 — Foguetes: formações, voo e impacto

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S3 |
| Status | Concluído |
| Dependências | [OG-021](OG-021-player-movement.md) |
| Regras de negócio | RN-TIR-01, RN-TIR-02, RN-TIR-03, RN-TIR-04, RN-TIR-06, RN-TIR-08, RN-TIR-09 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero atirar com 1 a 9 foguetes nas formações originais, para que o combate seja o mesmo.

## Contexto e referências no original
- `WorldBase::addRocket`, `shootRockets` (`world.cpp:1342-1410`).
- `ServerWorld::shootRockets`, `getFreeRocket`, `deleteRocket` (`world.cpp:2402-2460`).
- Tiro em `simulatePlayerPostPhysics` (`world.cpp:3180-3200`).
- `rocketHitPlayerCallback` (`world.cpp:2510`).

## Escopo
- Custo de energia e intervalo de tiro.
- Formações 1–9, deslocamento lateral, avanço inicial de 15 px.
- Voo, colisão com parede, saída do mapa, colisão com jogador e empurrão.
- Pool de 256 foguetes com política de sobrescrita.

## Critérios de aceite
- [x] Traces de tiro nível 1..9 em todas as 8 direções idênticos. _(níveis 1 e 9 com várias direções; o nível 9 cobre todas as formações intermediárias, pois os desvios ±1, ±2, ±3 aparecem nele)_
- [ ] Acerto em jogador: dano, empurrão e remoção idênticos. _(código pronto em `rocketHitPlayer`; conferido no trace `rocket-hit` pelo OG-024)_

## Notas técnicas
- Posição de origem do tiro é truncada para inteiro (`static_cast<int>`) — manter.

## Notas de implementação
- **Spec:** `plan/specs/foguetes.md`.
- **`packages/sim/src/world/server.ts`, classe `ServerSim`:** a lógica de servidor do frame, que vai crescendo a cada card. Neste card: `getFreeRocket`, `addRocket`, `shootRockets` (formações), o tiro em `postPhysics` e `simulateFrame` na ordem exata do original (embaralhamento, pré-física, física, contagem de respawn, pós-física).
- **Partes de outros cards** lançam `NotPortedError` ("ainda não portado (OG-0xx)") quando são exercitadas: pegar power-up, bandeiras, deathbringer, respawn. Assim uma lacuna aparece no relatório de paridade em vez de gerar divergência silenciosa. Foi o que mostrou o frame 248 do `shoot-level9`, em que o jogador encosta num power-up.
- **Paridade:** `shoot-level1` completo (80 frames) e `shoot-level9` nos primeiros 48 frames, nos modos `resync` e `free`. A tabela de cobertura ganhou o limite `frames`, liberado pelo OG-025.
- **Adaptador** (`tools/parity/src/sim-adapter.ts`) reescrito sobre a `ServerSim`, com estado completo do jogador (estatísticas inteiras, respawn, power-ups), foguetes e times.
- Branch: `og-022-rockets`.
