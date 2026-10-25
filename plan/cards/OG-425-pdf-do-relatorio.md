# OG-425 — PDF do relatório completo da partida

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S45 |
| Status | Pronto |
| Dependências | OG-380 |
| Regras de negócio | RN-SOC-08, D-80 |
| Skills | `outgun-card-workflow` |

## História
Como jogador ou capitão de clã, quero baixar o relatório completo da partida em PDF, para guardar e compartilhar no grupo.

## Contexto
- Pedido do PO em 2026-10-25 (S45): o celular volta, mas sem a partida — estatísticas, perfis, relatórios em PDF e moderação, tudo no visual retrô da S44 (OG-416). D-80 substitui a D-50.
- Decisão do PO (2026-10-25): PDF gerado no cliente, igual no celular e no computador, com layout próprio para A4.

## Escopo
- Botão "Baixar PDF" no relatório da partida (celular, desktop e apps desktop).
- Conteúdo: cabeçalho (Outgun, sala, mapa, modo, formato, data, duração, versão), placar e lados (com tag e cores do clã), destaques e melhor jogador, tabela completa dos jogadores, matriz de abates, linha do tempo das capturas, eventos (multi-kill, primeiro abate) e rating antes/depois no Ranked; rodapé com o link da partida e paginação.
- A4 retrato, texto selecionável, nome do arquivo `outgun-partida-<id>-<data>.pdf`; no app desktop, salvar pelo diálogo do sistema.
- Idioma do jogador.

## Critérios de aceite
- [ ] PDF de uma partida Casual e de uma Ranked com todas as seções, abrindo em leitores comuns (teste que gera o PDF a partir de uma partida fixa e confere o texto).
- [ ] A biblioteca de PDF só é baixada ao tocar em "Baixar PDF".
- [ ] Funciona no celular (Android/Chrome e iOS/Safari) e no desktop.

## Notas técnicas
- Biblioteca carregada sob demanda (ex.: `pdf-lib` ou `jsPDF` + autotable); fonte única do design system embutida (com acentos), cores dos tokens claros para impressão.
- Montagem dos dados reaproveita as funções puras do `MatchReport.tsx` (`highlights`, `killMatrix`, `captureTimeline`, `bestPlayer`).
- iOS: baixar por `Blob` + link; se o Safari abrir em aba, o usuário compartilha dali.

## Notas de implementação
(preenchido durante a execução)
