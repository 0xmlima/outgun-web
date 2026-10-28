# OG-502 — Resumo do jogo no PDF da partida

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S52 |
| Status | Em revisão |
| Dependências | OG-425, OG-485 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador ou capitão de clã, quero um resumo do jogo no PDF, lado a lado e nas cores dos clãs, para comparar os dois times de relance.

## Contexto
- Pedido do PO (2026-10-28), com um modelo de "Resumo do jogo" de app de futebol: barra de porcentagem no topo e, em cada linha, valor, rótulo e valor, com meia-barra de cada lado (o lado que leva vantagem em cor cheia). O resto do PDF fica igual.

## Escopo
- Painel escuro logo depois do placar, com o emblema e o nome de cada lado, nas cores do lado (a do clã quando o lado virou o clã; senão vermelho/azul).
- Barra de cima: tempo com a bandeira (%). Linhas: capturas, abates, mortes, bandeiras pegas/devolvidas/perdidas, tiros, precisão, tiros recebidos, distância percorrida, suicídios (linhas sem dado nos dois lados somem; mortes, bandeiras perdidas, tiros recebidos e suicídios: menos é melhor).

## Critérios de aceite
- [x] PDF da partida com o resumo nas cores dos clãs e com os emblemas; partida sem clã em vermelho/azul.
- [x] Teste do conteúdo do resumo.

## Notas de implementação
- `gameSummary` (puro, testado) e `drawSummary` em `report-pdf.ts`. Cores escuras de clã (preto, marinho, vinho) clareiam só dentro do painel para aparecer no fundo escuro.
- Só no PDF da partida (a capa da série não tem estatística de time).
