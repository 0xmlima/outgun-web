# OG-475 — Radar da partida no relatório: a partida por cima da média da temporada

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S53 |
| Status | Concluído |
| Dependências | OG-469, OG-470 |
| Regras de negócio | RN-RAD-01, RN-RAD-02 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver no relatório se aquela partida foi acima ou abaixo do meu normal, para responder "joguei bem hoje?".

## Contexto
- Pedido da comunidade (2026-10-28): gráfico de radar para os stats do jogador, com jogador x jogador, clã e clã x clã. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TEoTQesFht8C9vcPvo4N3u); respostas do PO na D-84.
- PO: todos os cards do radar (OG-469 a OG-479) entram na mesma sprint.

## Escopo
- No relatório da partida ranqueada (`MatchReport.tsx`), para cada jogador com conta: radar da partida (os mesmos 6 eixos, em percentil contra a população da temporada) por cima do radar da temporada dele, tracejado.
- Também no relatório em PDF (`report-pdf.ts`) e na versão de celular.
- Casual e bots não têm radar (RN-RAD-02).

## Critérios de aceite
- [x] Partida com poucos minutos (ex.: abandono) mostra "partida curta demais" em vez de um radar distorcido; limite de minutos proposto ao PO na revisão.

## Notas de implementação
- API `GET /matches/:id/style` (`matchStyle`: o `styleRows` filtrado pela partida, em percentil contra os ativos da temporada dela). Casual devolve `ranked: false` e nenhum jogador; bots ficam fora.
- **Limite proposto: 3 min jogados** (`MATCH_STYLE_MIN_SECONDS = 180`); abaixo disso, "partida curta demais". Confirmar com o PO.
- Web: painel "Estilo de jogo nesta partida" (`screens/match-style.tsx`) com um radar por jogador, na cor do lado, e a temporada tracejada; grade responsiva no celular. PDF: tabela com o percentil da partida e o da temporada entre parênteses (partida e série).
