# OG-471 — Radar no perfil: arquétipo, temporada passada em tracejado e filtros

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S53 |
| Status | Em revisão |
| Dependências | OG-469, OG-470 |
| Regras de negócio | RN-RAD-01, RN-RAD-03, RN-RAD-04, RN-SOC-02 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver meu radar e meu arquétipo no perfil e compará-los com o mês anterior, para saber onde evoluí.

## Contexto
- Pedido da comunidade (2026-10-28): gráfico de radar para os stats do jogador, com jogador x jogador, clã e clã x clã. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TEoTQesFht8C9vcPvo4N3u); respostas do PO na D-84.
- PO: todos os cards do radar (OG-469 a OG-479) entram na mesma sprint.

## Escopo
- Painel "Estilo de jogo" no perfil (`Profile.tsx`), no jogo e no portal do celular: radar, selo do arquétipo e número de ranqueadas da amostra.
- Temporada anterior desenhada em tracejado por baixo, com a tabela de mudança por eixo (+/−).
- Filtros: temporada atual (padrão) / temporadas anteriores / "sempre"; formato Todos/3x3/4x4/5x5. Filtros na URL, como os outros do perfil.
- Amostra pequena (RN-RAD-03): contorno tracejado e "poucos jogos"; sem radar abaixo de 3 ranqueadas, com o texto do que falta.
- Texto curto "Como ler o radar" (percentil, 50 = mediana, área não é nota, o percentil muda com quem joga) — pt-BR e inglês.

## Critérios de aceite
- [x] Perfil com radar nos estados: normal, amostra pequena, sem radar, sem temporada anterior.
- [x] Textos em pt-BR e inglês.

## Notas de implementação
- `screens/style-panel.tsx`: painel no perfil (abaixo das estatísticas), período na URL (`?style=`), formato do filtro do perfil; a temporada anterior vem na mesma resposta da API (`previous`).
- Textos com chaves em inglês no `t()` e pt-BR em `@outgun/i18n`; "Killing"/"Teamwork" porque "Kills"/"Team" já existiam com outro sentido. O OG-470 passou a usar o `t()` também.
- "Poucos jogos" = selo + série tracejada; sem radar, o texto diz quantas ranqueadas faltam.
