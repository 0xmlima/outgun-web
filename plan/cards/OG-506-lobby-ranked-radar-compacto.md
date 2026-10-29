# OG-506 — Lobby Ranked: radar confuso e barra de rolagem

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S54 |
| Status | Em revisão |
| Dependências | OG-477 |
| Regras de negócio | RN-RAD-01..05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador no lobby Ranked, quero ver o radar dos dois times de forma simples, sem a tela ganhar barra de rolagem.

## Contexto
- Achado do PO (2026-10-29, 2.53.0, captura com 1×1 no 3×3): o PO gosta do radar no lobby, mas o centro empilha radar, legenda, "Ver em tabela", a lista de vantagens por eixo (nomes de time quebrando em duas linhas: "Time / vermelho") e o rodapé dos arquétipos; a coluna do meio estoura a altura e a página rola.
- Lobby competitivo não deve ter barra de rolagem. Componente: `MatchupRadar` (`screens/matchup-radar.tsx`) dentro de `.ranked-radar` (`RankedLobby.tsx:224`).

## Escopo
- No lobby, versão enxuta do radar (ex.: o modo `mini`, sem a lista de vantagens e sem "Ver em tabela"; arquétipo de cada lado numa linha curta) que caiba na coluna do meio.
- O lobby inteiro cabe na janela (1280×720 para cima) sem rolagem da página, em todas as fases (aguardando, votação com mapas, prontos).
- Série e relatório da partida mantêm o radar completo.

## Critérios de aceite
- [x] Sem barra de rolagem no lobby Ranked em 1280×720 e 1600×900, com o radar aparecendo.
- [x] Radar do lobby legível: dois times, legenda e arquétipo, sem a tabela de vantagens.
- [ ] PO confere.

## Notas de implementação
- `StyleRadar compact` (rótulos, pontos e legenda, sem "Ver em tabela") e `MatchupRadar compact` (sem a lista de vantagens; arquétipo de cada lado numa linha curta). Série e relatório seguem com o radar completo.
- O lobby não rola mais a página: linhas `minmax(0, 1fr) auto` e `overflow: hidden`; times e centro rolam por dentro só se a janela for muito baixa. O gráfico tem no máximo 28vh. No celular (≤ 52rem) continua empilhado e rolando.
