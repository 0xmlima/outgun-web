# OG-296 — Opção "Escala do HUD"

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S25 |
| Status | Pronto |
| Dependências | [OG-293](OG-293-hud-escala-layout-faixa.md) |
| Regras de negócio | RN-UI-06 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero escolher o tamanho do HUD, para ajustar a uma tela ou distância que a escala automática não acerta.

## Escopo
- Opções › Gráficos: "Escala do HUD" — Automática (padrão), 1×, 1,5×, 2×, 2,5×, 3×.
- Preferência sincronizada com a conta como as outras; vale na hora, sem reiniciar a partida.
- Com escala manual, as regras de layout (OG-293 a OG-295) usam o `u` escolhido; se não couber (coluna menor que o placar mínimo), a área de jogo encolhe.

## Critérios de aceite
- [ ] A opção aparece, salva e muda o HUD durante a partida.
- [ ] Teste em `graphics-options.test.ts`/`options.test.ts`.

## Notas técnicas
## Notas de implementação
