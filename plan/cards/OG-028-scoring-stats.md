# OG-028 — Pontuação e estatísticas

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S5 |
| Status | Em andamento |
| Dependências | [OG-027](OG-027-flags-capture.md) |
| Regras de negócio | RN-PTS-*, RN-STA-01, RN-STA-02 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador competitivo, quero frags, pontos negativos e estatísticas calculados como no original.

## Contexto e referências no original
- Tabela de frags (seção 6.8 do PLAN).
- `Statistics` (`world.h:266`, `world.cpp:4069-4211`).
- `Team` stats.
- `save_stats` (`world.cpp:3752-3910`).

## Escopo
- Eventos de pontuação emitidos pela sim (`onFrag`, `onNeg`) sem dependência de rede.
- Estatísticas por jogador e por time.
- Exportação do resultado da partida em JSON (base para OG-084/085).

## Critérios de aceite
- [x] Placar final e estatísticas de uma partida com bots idênticos ao original (trace).
- [x] Cada linha da tabela de frags tem teste.

## Notas técnicas
- No original a pontuação passa por `host->score_frag` (servidor). Aqui vira evento da sim; o ranking (OG-084) aplica os modificadores.

## Notas de implementação
- Spec: [pontuacao-estatisticas.md](../specs/pontuacao-estatisticas.md). Pontuação já estava portada nos cards 024–027 e conferida pelos traces; este card adiciona `packages/sim/src/world/stats.ts` (métricas derivadas, `finishStats`, `comparePlayers`, `finishMatch`) e entrega o `MatchResult` em `hooks.gameOver(reason, result)`.
- Eventos de pontuação: `hooks.scoreFrag` e `hooks.scoreNeg` (equivalentes a `score_frag`/`score_neg`).
- Testes: `scoring.test.ts` (18 casos: cada linha da tabela de frags, pontos negativos, resultado); `parity.test.ts` compara o placar final da sim com o original em `match-time-win` e `match-extra-time`. As estatísticas de todos os jogadores e times são comparadas a cada frame em `bots-match` (6 bots, 600 frames).
- Correção no PLAN 6.8: os três bônus de sala não se somam (no máximo +1, com prioridade portador → defesa → ataque) e valem também com a bandeira na base; incluída a posse da selvagem nos frags e nos pontos negativos.
- `save_stats` em HTML vira o JSON `MatchResult`; persistência e telas ficam com OG-085 e o cliente.
