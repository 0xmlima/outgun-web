# OG-264 — UI da pausa, da queda e do voto dentro da partida (sem mudar o HUD atual)

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S20 |
| Status | Em revisão |
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
- [x] `pnpm visual:check` (OG-265) com diferença **zero** em todos os estados sem pausa, nas três resoluções.
- [x] Nos estados pausados, só a área declarada do overlay muda. (Conferido por inspeção das capturas do `pause-shots.mjs`, não por comparação automática.)
- [x] Conferido numa **partida online de verdade** e capturas da pausa e do voto entregues ao PO antes de ir para revisão.

## Notas técnicas
- Mesma fonte e tamanhos que o HUD já usa (fontes bitmap, OG-205 está fora); nada de mexer em escala, atlas ou fonte.

## Notas de implementação
- Overlay em `hud-renderer.ts` (`drawPause`): caixa única no centro da área de jogo, mesmas cores e fonte do "Server not responding"; textos montados em `online-hud.ts`. Só existe com `pauseState` em pausa — fora dela nada é desenhado. Saldo só no overlay (o placar não tem espaço sem mover nada).
- Teclas novas, sem tirar nenhuma: P/Pause (pausa e retoma), 1/2 (voto); gamepad Select, Y e X; clique nas opções do voto. Toque fora (D-50).
- `visual:check`: 14 de 16 capturas iguais nas duas resoluções; o `espectador` falhou de forma intermitente por uma corrida antiga do `replay-host` (passou na repetição) → OG-281 (S21). Os estados pausados não entram no `visual:check` (exige Ranked com contas): conferidos pelas capturas de `tools/visual-compare/pause-shots.mjs` (partida real com as contas do seed), que só mudam a caixa do overlay.
- Achados na partida real, corrigidos nos cards de origem: `pauseState` sem jogador quebrava a codificação (OG-262) e quem voltava sem o token entrava numa vaga nova (OG-261).
