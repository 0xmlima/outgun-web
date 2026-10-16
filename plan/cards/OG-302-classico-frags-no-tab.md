# OG-302 — Clássico com os frags só no TAB (opção)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S26 |
| Status | Concluído |
| Dependências | [OG-299](OG-299-placar-tab.md) |
| Regras de negócio | RN-UI-05, RN-UI-07 |
| Skills | `outgun-card-workflow` |

## História
Como jogador do HUD Clássico, quero tirar a lista de frags da tela e vê-la só no TAB, para ter um HUD mais limpo sem trocar de estilo.

## Contexto
Pedido do PO em 2026-10-16, durante a revisão da S26 (D-55). O Clássico continua o padrão e, com a opção desligada, idêntico ao de hoje (RN-UI-05).

## Escopo
- Opção "HUD clássico: frags só no TAB" em Opções › Gráficos, desligada por padrão, sincronizada com a conta.
- Ligada: sem a lista de frags na coluna. A sobra vai para o chat (telas largas: chat no alto da coluna até o minimapa, que desce para o fim dela); em 4:3 e 16:10 o minimapa fica com a altura natural do mapa.
- O placar dos times (capturas) aparece embaixo do relógio, como no F12.
- TAB abre o placar completo do Moderno (OG-299) em vez de trocar frags por pings.

## Critérios de aceite
- [x] Opção desligada: Clássico sem diferença no `visual:check`.
- [x] Opção ligada: série própria no `visual:check`, nada sobre a sala além do placar do TAB.
- [x] Teste do layout com a opção.

## Notas técnicas
## Notas de implementação
- Preferência `classicFragsOnTab` (padrão desligada), toggle em Opções › Gráficos (desativado fora do Clássico). `screenLayout(..., fragsOnTab)` tira o placar e redistribui: chat na coluna cresce até o minimapa, que desce para o fim da coluna (16:9); em 4:3 e 16:10 o minimapa fica com a altura natural. Sala e barra de baixo não mudam.
- Placar dos times embaixo do relógio (o mesmo do F12); TAB desenha o placar do OG-299 (`ScreenLayout.tabScoreboard`).
- Conferido numa partida online com bots (1920×1080, 1680×1050, 1280×720, 1024×768). Série `classico-tab-` no `visual:check`, herdando as máscaras do Clássico.
