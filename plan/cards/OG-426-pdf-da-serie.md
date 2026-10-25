# OG-426 — PDF do relatório da série

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S45 |
| Status | Concluído |
| Dependências | OG-425 |
| Regras de negócio | RN-SOC-08 |
| Skills | `outgun-card-workflow` |

## História
Como capitão no Ranked, quero o PDF da série inteira, para registrar o confronto md3/md5.

## Contexto
- Pedido do PO em 2026-10-25 (S45): o celular volta, mas sem a partida — estatísticas, perfis, relatórios em PDF e moderação, tudo no visual retrô da S44 (OG-416). D-80 substitui a D-50.

## Escopo
- "Baixar PDF" na tela da série: capa com o resultado da série e o resumo por partida, seguida do relatório completo de cada partida, em sequência, num arquivo só.
- Nome `outgun-serie-<id>-<data>.pdf`.

## Critérios de aceite
- [x] PDF de uma série md3 com a capa e as partidas (teste com série fixa).

## Notas técnicas
- Reaproveita o gerador do OG-425 por partida.

## Notas de implementação
- `saveSeriesPdf`: busca a página e os eventos de cada jogo em paralelo e monta a capa (`seriesCoverDoc`: resultado da série e o placar de cada jogo) seguida do relatório completo de cada partida, cada uma começando em página nova, com o link certo no rodapé.
- Botão "Baixar PDF" na página da série (com ao menos um jogo). Teste com uma série fixa em `report-pdf.test.ts`.
