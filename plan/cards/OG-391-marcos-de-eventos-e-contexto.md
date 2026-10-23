# OG-391 — Marcos de eventos e de contexto (armas, virada, ranked por formato, mapas, dupla, dias seguidos)

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S41 |
| Status | Em revisão |
| Dependências | OG-390, OG-362 |
| Regras de negócio | RN-SOC-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero marcos por jeitos diferentes de jogar (armas, viradas, formatos, mapas, parceiros), para o perfil contar a minha história no jogo.

## Contexto
- Eventos da partida (`match_events`, OG-362; Casual desde a 2.39.1, D-75): abate com momento, causa, sala e portador; ações de bandeira com o tipo (0 vermelha, 1 azul, 2 selvagem). Partidas mais antigas não têm eventos e não geram estes marcos.

## Escopo
- `MilestoneMatch` ganha `mode`, `format`, `map`, `team`, `scores` e `events` (já com os índices de jogador resolvidos para "eu", "aliado", "inimigo"); a API monta isso a partir de `match_events`/`match_event_players`.
- Marcos novos:
  - `wild_flag` Domador / Tamer · capturou a bandeira selvagem.
  - `triple_kill` Triplo / Triple kill · 3 kills em sequência (janela `MULTI_KILL_WINDOW`).
  - `deathbringer_1` Portador da morte / Deathbringer · kill com deathbringer; `deathbringer_50` Ceifador / Reaper · 50.
  - `comeback` Virada / Comeback · venceu depois de estar 2 capturas atrás.
  - `ranked_first` Estreia ranqueada / Ranked debut; `ranked_win` Primeira vitória ranqueada / First ranked win; `ranked_wins_100` Ranqueado / Ranked regular · 100 vitórias ranqueadas.
  - `win_3x3`, `win_4x4`, `win_5x5` Trio / Quarteto / Quinteto (Trio, Quartet, Quintet) · venceu uma ranqueada no formato.
  - `series_bo5` Série longa / Long series · venceu uma série md5.
  - `maps_10` Turista / Tourist · 10 mapas diferentes; `maps_25` Explorador / Explorer · 25.
  - `duo_50` Dupla dinâmica / Dynamic duo · 50 partidas no mesmo time do mesmo jogador com conta.
  - `days_7` Rotina / Routine · jogou em 7 dias seguidos (dia em America/Sao_Paulo; o `player_daily` usa UTC).
- As funções de leitura dos eventos ficam em `@outgun/content` (puras) e são reaproveitadas pelo OG-398.

## Critérios de aceite
- [x] Testes de cada marco com listas de eventos pequenas (inclusive "virada" que empata e não vira, e mapa gerado contando pelo nome).
- [x] Partida sem eventos não quebra o cálculo nem concede marco de evento.

## Notas técnicas
- Portador da morte/Ceifador podem sair de `stats.deathbringerKills` (vem no jsonb de toda partida), sem depender dos eventos: retroativo maior.
- Mapa gerado aleatoriamente conta como um mapa só (nome `random`/gerado), para "Turista" não sair em 10 partidas de mapgen.

## Notas de implementação
- Leitura dos eventos em `packages/content/src/milestone-events.ts` (cadeia de kills, bandeira selvagem, placar por captura), para o OG-398/399; `MULTI_KILL_WINDOW` mudou para lá e a API reexporta.
- Ao fim de cada partida a API só carrega os eventos dela (os marcos de evento são de uma partida); o retroativo carrega todos.
- Virada vale só na ranqueada (está no grupo Ranked). Deathbringer sai de `stats.deathbringerKills`, que existe desde antes da S38.
