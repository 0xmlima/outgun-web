# OG-294 — Placar de borda a borda, com escala própria

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S25 |
| Status | Concluído |
| Dependências | [OG-293](OG-293-hud-escala-layout-faixa.md) |
| Regras de negócio | RN-UI-05, RN-UI-06 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero o placar ocupando toda a coluna da direita com frags maiores, para ler o placar de relance sem espaço preto sobrando.

## Contexto
- Hoje o placar tem 20 caracteres de 8 px (160 px) centralizados numa coluna de até 540 px. Pedido do PO na revisão do protótipo (D-54): preencher todo o espaço à direita.

## Escopo
- Escala do placar `s` = maior valor em {u, u+½, …, 2u} que deixe o minimapa visível (altura mínima 42% da largura do minimapa).
- Quadro de borda a borda na coluna (margem 4u + recuo 6s), do fim do minimapa até a linha do FPS; linhas esticadas para preencher a altura (entre `18s` e `2·16s`).
- Nome à esquerda, frags (ou ping) na borda direita, divisória antes dos frags; bandeirinha de quem carrega na escala `s`.
- Times lado a lado quando a coluna comporta (`2·176s + 8u + 12 ≤ coluna`).

## Critérios de aceite
- [x] Em 1024×768 a 2048×1536 o placar ocupa a largura da coluna e vai até o FPS.
- [x] Escalas: 1024×768 → 1×, 1280×960 e 1440×1080 → 1,5×, 1600×1200 → 2×, 2048×1536 → 2,5× (protótipo).
- [x] Nomes longos não invadem a coluna dos frags.

## Notas técnicas
## Notas de implementação
- `drawScoreboard` reescrito: quadro com margem 4u na coluna, linhas esticadas até o FPS (entre `altura+2k` e `2·altura`), frags e "capt" alinhados na borda direita, divisória a 3 dígitos dos frags. A escala `s` vem do layout (OG-293); "lado a lado" já é suportado (usado pelo OG-295).
- `scoreboardName(nome, max)` corta pelo que cabe até a divisória (máx. 15). Conferência visual fica para o fechamento (capturas do `visual:check`).
