# OG-026 — Deathbringer

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S4 |
| Status | Em revisão |
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
- [x] Traces com explosão atingindo 0, 1 e vários jogadores idênticos. _(1 alvo em `db-explosion`; 2 alvos, aliado e inimigo, em `db-friendly`; jogadores em outras salas não são atingidos)_
- [x] Fogo amigo de deathbringer (`friendly_deathbringer`) coberto.

## Notas técnicas
- —

## Notas de implementação
- **Spec:** `plan/specs/deathbringer.md`.
- **Código:** `DeathbringerExplosion` (`state.ts`); na `ServerSim`, criação em `killPlayer`, limpeza das expiradas e `deathbringerHits` em `simulateFrame`. O efeito contínuo, a degradação e a infecção já vinham dos cards OG-023 e OG-024.
- **Paridade:** `db-explosion` e `db-friendly` idênticos de primeira nos modos `resync` e `free`, incluindo a duração sorteada (±10%), o empurrão, a máscara "fora do anel" e o respawn com +4 s.
- Branch: `og-026-deathbringer`.
