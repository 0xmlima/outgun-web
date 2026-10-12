# OG-022 — Foguetes: formações, voo e impacto

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S3 |
| Status | Backlog |
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
- [ ] Traces de tiro nível 1..9 em todas as 8 direções idênticos.
- [ ] Acerto em jogador: dano, empurrão e remoção idênticos.

## Notas técnicas
- Posição de origem do tiro é truncada para inteiro (`static_cast<int>`) — manter.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
