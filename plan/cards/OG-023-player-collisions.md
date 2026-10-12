# OG-023 — Colisões entre jogadores (none/normal/special)

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S3 |
| Status | Backlog |
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
- [ ] Traces de colisão frontal, lateral e em cadeia idênticos nos 3 modos.
- [ ] Efeitos especiais cobertos por testes unitários com os valores de RN-FIS-11.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
