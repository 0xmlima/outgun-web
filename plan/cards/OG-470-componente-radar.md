# OG-470 — Componente de radar no design system (SVG, tooltip, tracejado, mini e tabela)

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-200 |
| Regras de negócio | RN-RAD-01, RN-RAD-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero um gráfico de radar legível e consistente em todo o portal, para comparar estilos de jogo de relance.

## Contexto
- Pedido da comunidade (2026-10-28): gráfico de radar para os stats do jogador, com jogador x jogador, clã e clã x clã. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TEoTQesFht8C9vcPvo4N3u); respostas do PO na D-84.
- PO: todos os cards do radar (OG-469 a OG-479) entram na mesma sprint.

## Escopo
- Componente `StyleRadar` em `apps/web/src/ui/`: SVG com anéis 25/50/75/100 (o 50 tracejado), raios, nomes dos eixos e até 3 séries sobrepostas (cor, preenchimento leve, pontos).
- Série tracejada (temporada anterior, amostra pequena) e série "sombra" cinza por baixo (OG-476).
- Tooltip no ponto com percentil e valor bruto na unidade do eixo.
- Variante **mini** (sem rótulos) para os membros do clã e o lobby.
- "Ver em tabela": a mesma informação em tabela (percentil + bruto), também para leitores de tela.
- Cores só dos tokens do design system (vermelho/azul dos times, cor do clã quando houver); funciona de 360 px (RN-UI-08) ao desktop.

## Critérios de aceite
- [ ] Teste de geometria: ponto do eixo i com valor v cai no raio e ângulo certos; ordem dos eixos fixa.
- [ ] Componente na tela de desenvolvimento de UI (`DevUiScreen`) com os estados: 1, 2 e 3 séries, tracejada, mini, sem dados.

## Notas de implementação
