# OG-207 — Título do mapa (e não o nome do arquivo) em todas as telas

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Correção |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S18 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | RN-UI-01 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver o mesmo nome de mapa em todas as telas, para não achar que joguei num mapa diferente do que vi na partida.

## Contexto
- O mapa padrão é o arquivo `outgun1.txt`, mas o título dele é `P title The Blunt` (`_legacy/maps/outgun1.txt:11`, igual ao original). Não é erro de registro: a partida grava os dois (`map: "outgun1"` como id e `details.mapTitle: "The Blunt"`, `apps/game-server/src/match-report.ts`).
- A barra da partida, o relatório (`MatchReport.tsx`), o replay e o espectador mostram o **título**. Já estas telas mostram o **nome do arquivo**:
  - "Suas partidas recentes" na tela inicial (`menus.tsx:41`, `m.map`) e o histórico do perfil, porque `GET /players/:name/matches` não devolve o título (`MatchSummary`, `apps/api/src/routes/players.ts:28`);
  - a lista de salas e o cabeçalho da sala no lobby (`lobby.tsx:226` e `:266`), porque o heartbeat da sala só leva `map` (`apps/api/src/routes/internal.ts`).
- Relatado pelo PO em 2026-10-15 (partidas no "The Blunt" aparecendo como "outgun1").

## Escopo
- API: incluir `mapTitle` no resumo de partida (lido de `details->>'mapTitle'`, sem migração) em todas as listas que usam `MatchSummary`.
- Game-server → API: levar `mapTitle` no heartbeat da sala e devolvê-lo em `GET /rooms`, `GET /rooms/:id` e na lista Ranked.
- Cliente: tela inicial, perfil, lista de salas e cabeçalho da sala mostram o título; a busca de salas aceita título **ou** arquivo.
- Fica como está: o painel admin e a rotação mostram o arquivo (é o id que o admin edita).

## Critérios de aceite
- [ ] Uma partida no `outgun1` aparece como "The Blunt" na tela inicial, no perfil, no relatório, na lista de salas e no cabeçalho da sala.
- [ ] Partidas antigas sem `mapTitle` e servidores que ainda não mandam o título continuam funcionando (cai no nome do arquivo).
- [ ] Buscar "outgun1" ou "blunt" na lista de salas encontra a sala.

## Notas técnicas
- Campo de sala novo → coluna nullable `map_title` em `rooms` (migração Drizzle) ou, se preferir evitar migração, guardar junto do `map` no registro do heartbeat; escolha a mais simples e registre aqui.
- Título vazio no arquivo do mapa → usar o nome do arquivo.

## Notas de implementação
(preenchido durante a execução)
