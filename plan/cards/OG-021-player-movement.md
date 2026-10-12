# OG-021 — Movimento do jogador e troca de sala

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S2 |
| Status | Em revisão |
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
- [x] Traces de andar/correr/diagonal/turbo/bandeira/strafe idênticos por 300 frames. _(8 traces de 60 a 150 frames, idênticos frame a frame e também simulando livremente; bandeira fica para o OG-027)_
- [x] Velocidade máxima de corrida confere com a fórmula RN-FIS-07. _(e com a peculiaridade do servidor: fixa em 27,1875)_

## Notas técnicas
- —

## Notas de implementação
- **Spec:** `plan/specs/movimento-jogador.md`.
- **Código (`packages/sim/src/world/`):**
  - `controls.ts`: bits, direção e `GunDirection`.
  - `state.ts`: `WorldState`, `PlayerState`, `RocketState`, `FlagState`, `Position`.
  - `physics.ts`: aceleração, quique, limite de velocidade e o laço completo por sala. Já inclui os eventos de foguete e de colisão entre jogadores, cujos efeitos de jogo ficam nos callbacks (OG-022/023/024).
- **Paridade:** `tools/parity/src/sim-adapter.ts` (`SimTraceAdapter`, encontra o mapa pelo CRC e lê o gamemod do trace) + `movement.test.ts`. Os 8 cenários de movimento batem em posição, velocidade e distância percorrida, comparando frame a frame (`resync`) e deixando a sim andar sozinha do primeiro ao último frame (`free`).
- **Descoberta → patch do oráculo:** o `get_time()` do original avança durante o frame (outras threads chamam `refresh()`), o que tornava a expiração do turbo no limite não determinística (falha no frame 230 do `move-turbo`). O patch congela o relógio durante cada frame gravado; todos os traces foram regravados.
- **`runParity`** ganhou `applyInputs` no modo `free`: a sim recebe as entradas do roteiro a cada frame e mantém o próprio estado físico.
- Branch: `og-021-player-movement`.
