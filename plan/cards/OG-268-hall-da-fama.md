# OG-268 — Hall da fama

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S19 |
| Status | Em revisão |
| Dependências | [OG-267](OG-267-temporadas-mensais.md), [OG-274](OG-274-ranking-clas.md) |
| Regras de negócio | RN-RKL-24 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver os campeões de cada temporada, para que quem se destacou fique registrado para sempre.

## Escopo
- Página `/hall-da-fama`: para cada temporada encerrada, os 3 primeiros do ranking geral, de cada formato (3x3, 4x4, 5x5) e de clãs (D-48).
- Selo no perfil do jogador e na página do clã ("Campeão 3x3 — Temporada 2026-11").
- Gerado a partir da classificação final guardada pelo OG-267 (não recalcula).

## Critérios de aceite
- [x] Temporada com menos de 3 classificados mostra só os que houver.
- [x] Design system v2, URL estável.

## Notas de implementação
- Migration 0025 `season_champions`: gravada por `snapshotStandings` na virada (e regravada se chegar partida atrasada), com os nomes da época; conta apagada sai do hall, clã apagado fica sem link. Temporadas encerradas antes desta migration não têm hall (no beta não há nenhuma).
- `GET /hall-of-fame`; `titles` em `/players/:name` e `/clans/:tag`. Página `/hall-da-fama` com link no fim de `/ranking` (não pus no topo para não mexer na barra).
- Selos: "Campeão/2º lugar/3º lugar <quadro> · <temporada>"; usei "·" no lugar de "—" (os textos são só Latin-1).
