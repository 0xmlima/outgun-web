# OG-207 — Título do mapa (e não o nome do arquivo) em todas as telas

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Correção |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S18 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | RN-UI-01 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver o mesmo nome de mapa em todas as telas, para não achar que joguei num mapa diferente do que vi na partida.

## Contexto
- O mapa padrão é o arquivo `outgun1.txt`, mas o título dele é `P title The Blunt` (`_legacy/maps/outgun1.txt:11`, igual ao original). Não é erro de registro: a partida grava os dois (`map: "outgun1"` como id e `details.mapTitle: "The Blunt"`, `apps/game-server/src/match-report.ts`).
- A barra da partida, o relatório (`MatchReport.tsx`), o replay, o espectador e o lobby (o heartbeat já leva o título, `apps/game-server/src/rooms.ts:150`) mostram o **título**. Só o histórico de partidas mostrava o **arquivo**: "Suas partidas recentes" na tela inicial (`menus.tsx`) e o histórico do perfil (`Profile.tsx`), porque `GET /players/:name/matches` não devolvia o título (`MatchSummary`, `apps/api/src/routes/players.ts`).
- Relatado pelo PO em 2026-10-15 (partidas no "The Blunt" aparecendo como "outgun1").

## Escopo
- API: incluir `mapTitle` no resumo de partida (lido de `details.mapTitle`, sem migração), usado no histórico do jogador e na última partida da sala.
- Cliente: tela inicial e perfil mostram o título.
- Fica como está: o painel admin e a rotação mostram o arquivo (é o id que o admin edita).

## Critérios de aceite
- [x] Uma partida no `outgun1` aparece como "The Blunt" na tela inicial, no perfil e no relatório.
- [x] Partidas antigas sem `mapTitle` continuam funcionando (cai no nome do arquivo).

## Notas técnicas
- Título vazio ou ausente em `details` → usar o nome do arquivo.

## Notas de implementação
- Escopo reduzido na execução: o lobby já mostrava o título (análise inicial errada); a correção ficou só no resumo de partida da API e nas duas tabelas de histórico.
- `apps/api/openapi.json` versionado está desatualizado desde antes da S18; não regenerado aqui para não misturar (fica para o fechamento da sprint).
