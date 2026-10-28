# OG-469 — Radar de estilo: API com os 6 eixos em percentil e o arquétipo

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S53 |
| Status | Em revisão |
| Dependências | OG-358, OG-363 |
| Regras de negócio | RN-RAD-01, RN-RAD-02, RN-RAD-03, RN-RAD-04, RN-LDB-01 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero saber como eu jogo (abate, precisão, sobrevivência, bandeira, defesa, equipe) comparado com o resto do servidor, para entender meu estilo e onde melhorar.

## Contexto
- Pedido da comunidade (2026-10-28): gráfico de radar para os stats do jogador, com jogador x jogador, clã e clã x clã. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TEoTQesFht8C9vcPvo4N3u); respostas do PO na D-84.
- PO: todos os cards do radar (OG-469 a OG-479) entram na mesma sprint.

## Escopo
- Função `styleProfile` (novo `apps/api/src/style-radar.ts`) que devolve, para uma conta, os 6 eixos na ordem fixa da RN-RAD-01, cada um com **percentil** (0–100) e **valor bruto**:
  - Abates = kills sem bots por 10 min; Precisão = hits ÷ shots no período; Sobrevivência = tempo médio de vida;
  - Bandeira = (flagsTaken + 3 × captures) por 10 min; Defesa = (flagsReturned + carriersKilled + defenses) por 10 min; Equipe = (assists + trocas) por 10 min.
- Percentil contra **todos os ativos da temporada** (quem tem o mínimo da RN-LDB-04 no período/formato), só ranqueadas concluídas, sem bots (RN-RAD-02).
- Período: temporada atual (padrão), uma temporada anterior (para o tracejado do OG-471) e "sempre" (opção). Filtro por formato (Todos/3x3/4x4/5x5), como no leaderboard.
- Amostra (RN-RAD-03): `games` no retorno; menos de 3 ranqueadas → sem radar; de 3 a 9 → `lowSample: true`.
- Arquétipo (RN-RAD-04): Atirador, Corredor, Muralha, Suporte, Sobrevivente ou Coringa, calculado dos percentis.
- Rota `GET /players/:name/style?season=&format=` no OpenAPI; resposta com cache curto (o cálculo percorre a temporada inteira).

## Critérios de aceite
- [x] Testes com jogadores montados à mão: percentil de cada eixo (inclusive empate, jogador sozinho e o limite de 5 partidas da população), bots e casuais fora, filtro de formato.
- [x] Testes do arquétipo em cada regra, inclusive o empate de eixos e o limite de amplitude do Coringa.
- [x] Período "sempre" e stats que só existem desde a S38 mostram "desde DD/MM" (RN-LDB-03).

## Notas técnicas
- Reaproveitar o escopo e as consultas do `statBoard` de `apps/api/src/leaderboard.ts` (o `overallBoard` já faz percentil por posição). Conferir se `defenses` e `carriersKilled` contam o mesmo abate duas vezes; se sim, não somar em dobro.
- Pensar numa consulta única por período (todas as contas de uma vez) para servir também a mediana do clã (OG-473) e a sombra do top 10 (OG-476).

## Notas de implementação
- `apps/api/src/style-radar.ts`: `styleRows` (uma consulta por período, todas as contas), `styleProfiles` e `stylePeriod` (cache de 60 s); o clã (OG-473) e o top 10 (OG-476) reaproveitam a lista. Rota em `routes/style.ts`.
- Percentil = (abaixo + metade dos empates) ÷ população sem o próprio jogador; sozinho = 100. Quem tem 3–4 partidas tem radar mas não entra na base.
- Empate no eixo mais alto do arquétipo segue a ordem dos eixos (Abates primeiro). Defesa soma `defenses` e `carriersKilled`: só se sobrepõem quando o portador inimigo morre perto do nosso portador (raro).
- A resposta já traz a temporada anterior (`previous`) e o "desde" de Defesa (`defenses`) e Equipe (`trades`).
