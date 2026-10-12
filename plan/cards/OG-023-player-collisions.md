# OG-023 — Colisões entre jogadores (none/normal/special)

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S3 |
| Status | Em revisão |
| Dependências | [OG-021](OG-021-player-movement.md) |
| Regras de negócio | RN-FIS-10, RN-FIS-11 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero que as colisões entre naves funcionem como no original, incluindo os efeitos especiais.

## Contexto e referências no original
- `executeBounce` (`world.cpp:2693-2735`).
- `playerHitPlayerCallback` (`world.cpp:2545-2685`).
- Loop por sala `applyPhysicsToRoom` (`world.cpp:2826-3050`).

## Escopo
- Modos none/normal/special.
- Efeitos especiais: shadow, turbo (toss ×2), infecção de deathbringer, dano por shield e por power.
- Colisão entre portadores aliados para captura com `carry_own_team_flag`.

## Critérios de aceite
- [x] Traces de colisão frontal, lateral e em cadeia idênticos nos 3 modos. _(`no` coberto pelos traces de movimento do preset Clássico; `normal` e `special` por 5 cenários novos, incluindo colisões em cadeia no `collide-special-turbo-shadow`)_
- [x] Efeitos especiais cobertos por testes unitários com os valores de RN-FIS-11. _(cobertos por paridade frame a frame: shield, power, turbo, shadow compartilhado e infecção de deathbringer)_

## Notas técnicas
- —

## Notas de implementação
- **Spec:** `plan/specs/colisoes-jogadores.md`.
- **Código:** `executePlayerBounce` (`physics.ts`, OG-021) e `ServerSim.playerHitPlayer` (`server.ts`, escrito junto com o OG-022).
- **Paridade:** 5 cenários novos gravados no original, todos idênticos de primeira nos modos `resync` e `free`, com o estado completo:
  - `collide-normal`;
  - `collide-special-shield`;
  - `collide-special-power` (humilhação: 100 → 30 de vida);
  - `collide-special-turbo-shadow` (shadow passado ao aliado, arremesso e revelação);
  - `collide-special-deathbringer` (infecção e 3 de dano por frame).
- Branch: `og-023-player-collisions`.
