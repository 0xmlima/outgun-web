# OG-026 — Deathbringer

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S4 |
| Status | Backlog |
| Dependências | [OG-025](OG-025-powerups.md) |
| Regras de negócio | RN-DB-01, RN-DB-02, RN-DB-03, RN-DB-04, RN-DB-05 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero o deathbringer funcionando como no original, para manter sua dinâmica tática.

## Contexto e referências no original
- `DeathbringerExplosion` (`world.h:809`, `world.cpp:1421`).
- Hits da explosão em `simulateFrame` (`world.cpp:3470-3510`).
- Efeito contínuo em `simulatePlayerPrePhysics`.
- `killPlayer` (`world.cpp:2258`).

## Escopo
- Criação e expansão da explosão, máscara de jogadores fora do anel.
- Efeito (duração aleatória ±10%, trava de arma, empurrão, dano por frame).
- Degradação do portador e tempo extra de respawn.

## Critérios de aceite
- [ ] Traces com explosão atingindo 0, 1 e vários jogadores idênticos.
- [ ] Fogo amigo de deathbringer (`friendly_deathbringer`) coberto.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
