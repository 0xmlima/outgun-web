# OG-380 — Relatório da partida no visual novo, com os marcadores novos à vista

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S40 |
| Status | Em revisão |
| Dependências | OG-355, OG-364 |
| Regras de negócio | RN-SOC-01 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero um relatório da partida com o visual do resto do jogo e os números novos à vista, para entender a partida sem caçar a informação.

## Contexto
- Achado do PO em 2026-10-22: a página do relatório usa o visual antigo e não mostra os marcadores novos.
- Os contadores do OG-355 (dano efetivo, abates por zona, defesas) **já são gravados também no Casual** (conferido no banco do beta), mas só aparecem na tabela "Estatísticas detalhadas", recolhida no fim da página e com as tabelas antigas (`stats-table`).

## Escopo
- Tabelas e seções do relatório no design system v2 (`apps/web/src/ui/`, `Table`, tokens), sem as classes antigas.
- Dano efetivo, defesas e abates por zona nas tabelas dos times (à vista), não só no detalhado.
- Os blocos do registro de eventos (multi-kill, troca, primeiro abate, quem matou quem) com o mesmo visual.

## Critérios de aceite
- [x] Relatório de uma Casual mostra dano efetivo, defesas e abates por zona sem abrir o detalhado.
- [x] Nenhuma tabela do relatório usa as classes antigas.

## Notas de implementação
- Tabelas dos times ganharam Dano efetivo, Defesas e Abates por zona (base inimiga · meio · própria, legenda abaixo); novo painel "Destaques" com quem liderou dano, defesas, multi-kills, trocas e primeiros abates (`highlights`).
- "Estatísticas detalhadas" (times, abates por vítima, jogadores) no `Table`/`Panel` do design system; nomes com a cor do time (`.report-name`). Nenhuma `stats-table` no relatório.
- Partidas anteriores ao OG-355 mostram "—" e não entram nos destaques.
