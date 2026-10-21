# OG-352 — Leaderboard de atributos: API

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S37 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | RN-LDB-01..04 (D-66) |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver quem se destacou em cada atributo no mês, para ter onde competir mesmo sendo novo no jogo.

## Contexto
- Proposta com a comunidade, seção "O que cada stat do leaderboard considera". Os stats dos grupos A e B já estão em `match_players.stats` desde 2026-10-13, então o leaderboard vale para todo o histórico.

## Escopo
- Endpoint público do leaderboard: stat, período (temporada mensal por id, ou "sempre"), formato (todos, 3x3, 4x4, 5x5), paginação.
- Só partidas ranqueadas concluídas; só contas com participação ativa; bots fora.
- Stats e forma de ranquear (RN-LDB-02):
  - por 10 min jogados: abates (sem `botKills`), capturas, assistências, bandeiras pegas, devolvidas, portadores abatidos, tempo com bandeira (s), frags, dano bruto;
  - razão no período: K/D (abates / mortes), precisão (acertos / tiros);
  - recorde no período: maior sequência de abates;
  - média: tempo médio de vida.
- Dano bruto = acertos × `rocket_damage` das regras da partida (70 no Ranked).
- Mínimo de 5 partidas no período; desempate pelo total bruto do stat e depois por nome.
- Lista de stats numa constante única, que a página (OG-353) e o hall da fama (OG-354) leem.

## Critérios de aceite
- [ ] Testes por grupo de stat (por 10 min, razão, recorde, média), mínimo de partidas, filtro de formato e período.
- [ ] Casual, canceladas e bots não entram; abates em bot substituto não contam.
- [ ] Consulta indexada no PostgreSQL; OpenAPI atualizado.

## Notas de implementação
(preenchido durante a execução)
