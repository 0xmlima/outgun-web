# OG-021 — Movimento do jogador e troca de sala

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S2 |
| Status | Backlog |
| Dependências | [OG-020](OG-020-geometry-walls.md) |
| Regras de negócio | RN-FIS-01, RN-FIS-02, RN-FIS-03, RN-FIS-04, RN-FIS-05, RN-FIS-06, RN-FIS-07, RN-MAP-02, RN-TIR-10 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero que a nave acelere, freie, corra e deslize como no original, para manter a sensação de controle.

## Contexto e referências no original
- `WorldBase::applyPlayerAcceleration` (`world.cpp:1209`).
- `applyPhysicsToPlayerInIsolation` e troca de sala (`world.cpp:2780-2825`).
- `limitPlayerSpeed` (`world.cpp:2734`).
- `ClientControls` (`commont.h:60-110`), `GunDirection` (`world.h:387`).

## Escopo
- Controles (bitmask), direção da arma 8-way e livre, strafe.
- Aceleração com multiplicadores, drag, atrito, freio/curva, limite rígido.
- Movimento sub-frame com quique e wrap toroidal.

## Critérios de aceite
- [ ] Traces de andar/correr/diagonal/turbo/bandeira/strafe idênticos por 300 frames.
- [ ] Velocidade máxima de corrida confere com a fórmula RN-FIS-07.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
