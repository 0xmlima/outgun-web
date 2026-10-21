# OG-340 — Espectador e replay com minimapa, placar e frags

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Melhoria |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S35 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como quem assiste uma partida ao vivo ou um replay, quero ver o minimapa, o placar e os frags, para entender o jogo como quem joga.

## Contexto
- Pedido do PO em 2026-10-21: espectador e replay mostravam só as salas e os jogadores; quem assistia ficava perdido.
- O replay e o espectador já usam a mesma `ClientSession` da partida (`me = −1`, OG-090/OG-092); faltava desenhar o HUD.

## Escopo
- `replay-host` monta o `OnlineHud` + `HudRenderer` da partida no estilo Clássico: minimapa com jogadores e bandeiras, placar dos times, frags de cada jogador, relógio do mapa, chat e avisos (capturas, mortes, fim de partida). As salas ficam na área de jogo da tela dividida.
- O HUD é recriado quando o replay volta no tempo (a sessão é refeita); "servidor não responde" não aparece no replay.
- Barra de controles do replay e do espectador vai para o topo, para não cobrir o minimapa e o placar.

## Critérios de aceite
- [x] Replay e espectador com o HUD da partida; testes do cliente passando.
- [ ] PO confere um replay e uma partida assistida ao vivo.

## Notas de implementação
- Sem barras de vida/energia: o espectador não é jogador. Seguir um jogador (F) mostrar as barras dele fica para outro card, se o PO quiser.
- Sempre o estilo Clássico, independente da preferência de HUD de quem assiste.
