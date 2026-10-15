# OG-264 — UI da pausa, da queda e do voto dentro da partida (sem mudar o HUD atual)

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S20 |
| Status | Backlog |
| Dependências | [OG-265](OG-265-protecao-visual-hud.md), [OG-260](OG-260-pausa-tatica.md), [OG-262](OG-262-voto-bot-substituto.md) |
| Regras de negócio | RN-UI-05, RN-RKL-15 a RN-RKL-19 |
| Skills | `outgun-card-workflow` |

## História
Como jogador de Ranked, quero ver claramente que o jogo está pausado, por quê e por quanto tempo, e votar sobre o bot, sem que nada do HUD que conheço mude de lugar.

## Escopo
- Um **único overlay temporário** no centro da área de jogo, só enquanto pausado: motivo (time X pediu / jogador Y caiu), tempo restante, saldo de pausa dos dois times, contagem de retomada e o voto (duas opções, teclado/mouse/toque/gamepad).
- Tecla de pausa nos controles (sem tirar nenhuma tecla existente).
- Fora da pausa, **nenhum pixel do HUD muda**: o saldo de pausa só aparece no placar (Tab) se couber sem mover nada; senão, só no overlay.

## Critérios de aceite
- [ ] `pnpm visual:check` (OG-265) com diferença **zero** em todos os estados sem pausa, nas três resoluções.
- [ ] Nos estados pausados, só a área declarada do overlay muda.
- [ ] Conferido numa **partida online de verdade** e capturas da pausa e do voto entregues ao PO antes de ir para revisão.

## Notas técnicas
- Mesma fonte e tamanhos que o HUD já usa (fontes bitmap, OG-205 está fora); nada de mexer em escala, atlas ou fonte.

## Notas de implementação
(preenchido durante a execução)
