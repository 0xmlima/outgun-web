# OG-298 — HUD Moderno: sala grande e coluna do jogador (opção A)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S26 |
| Status | Em andamento |
| Dependências | [OG-297](OG-297-estilo-hud-layout-componentes.md) |
| Regras de negócio | RN-UI-07 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero um HUD mais limpo, sem a lista de frags na tela e com nada sobre a sala, para ver a partida inteira e achar a vida e o placar num lugar só.

## Contexto
Protótipo aprovado pelo PO em 2026-10-16: `plan/specs/hud-moderno/prototipo-hud-moderno.html` (opção A). Decisão D-55.

## Escopo
- Layout da opção A do protótipo `plan/specs/hud-moderno/`: sala com a altura toda à esquerda (proporção da sala), coluna à direita com placar dos times e relógio, minimapa, vida, energia, power-ups, arma, chat e FPS; quando sobra uma faixa embaixo da sala (4:3), o chat vai para ela.
- Nada é desenhado sobre a sala (D-55) além do que já existia (avisos de troca de time/mapa, pausa, fim de partida).
- Texto em Inter (D-35) como fonte bitmap instalada no tamanho final de cada texto, depois de a Inter carregar (lição do OG-205).
- F12 esconde só o minimapa; a lista de frags não aparece (fica no TAB, OG-299).

## Critérios de aceite
- [ ] 1920×1080, 1680×1050, 1280×720 e 1024×768 sem nada sobre a sala e sem texto cortado.
- [ ] Texto em Inter no tamanho certo, conferido numa partida online de verdade (capturas ao PO).
- [ ] Capturas do Moderno no `visual:check`.

## Notas técnicas
## Notas de implementação
