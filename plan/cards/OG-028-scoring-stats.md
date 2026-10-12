# OG-028 — Pontuação e estatísticas

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S5 |
| Status | Backlog |
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
- [ ] Placar final e estatísticas de uma partida com bots idênticos ao original (trace).
- [ ] Cada linha da tabela de frags tem teste.

## Notas técnicas
- No original a pontuação passa por `host->score_frag` (servidor). Aqui vira evento da sim; o ranking (OG-084) aplica os modificadores.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
