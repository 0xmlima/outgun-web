# OG-352 — Leaderboard de atributos: API

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S37 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-LDB-01..04 (D-66) |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver quem se destacou em cada atributo no mês, para ter onde competir mesmo sendo novo no jogo.

## Contexto
- Proposta com a comunidade, seção "O que cada stat do leaderboard considera". Os stats dos grupos A e B já estão em `match_players.stats` desde 2026-10-13, então o leaderboard vale para todo o histórico.

## Escopo
- Endpoint público do leaderboard: stat, período (temporada mensal por id, ou "sempre"), formato (todos, 3x3, 4x4, 5x5), paginação.
- Só partidas ranqueadas concluídas; todas as contas (não há opção de ficar de fora, RN-SKL-06); bots fora.
- Stats e forma de ranquear (RN-LDB-02):
  - por 10 min jogados: abates (sem `botKills`), capturas, assistências, bandeiras pegas, devolvidas, portadores abatidos, tempo com bandeira (s), frags, dano bruto;
  - razão no período: K/D (abates / mortes), precisão (acertos / tiros);
  - recorde no período: maior sequência de abates;
  - média: tempo médio de vida.
- Dano bruto = acertos × `rocket_damage` das regras da partida (70 no Ranked).
- Mínimo de 5 partidas no período; desempate pelo total bruto do stat e depois por nome.
- Lista de stats numa constante única, que a página (OG-353) e o hall da fama (OG-354) leem.

## Critérios de aceite
- [x] Testes por grupo de stat (por 10 min, razão, recorde, média), mínimo de partidas, filtro de formato e período.
- [x] Casual, canceladas e bots não entram; abates em bot substituto não contam.
- [x] Consulta indexada no PostgreSQL; OpenAPI atualizado.

## Notas de implementação
- `apps/api/src/leaderboard.ts`: lista única `LEADERBOARD_STATS` (com `main` para o hall) e uma consulta por stat sobre `match_players` + `matches`. Rotas `GET /leaderboard/stats` (3 primeiros de cada) e `GET /leaderboard/stats/:stat` (`season`, `overall`, `format`, `player`, paginação).
- Dano bruto usa os acertos totais: o jogo não separa acertos em bot substituto (abates em bot já ficam fora).
- K/D com 0 mortes divide por 1; tempo médio de vida = tempo vivo / (mortes + partidas), como o original.
- Sem índice novo: a consulta já filtra por partida ranqueada; medir no fechamento se a página ficar lenta.
