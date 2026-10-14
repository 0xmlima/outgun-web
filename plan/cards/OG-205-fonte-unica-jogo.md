# OG-205 — Fonte única dentro da partida (HUD, chat, placar e overlays)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S14 |
| Status | Backlog |
| Dependências | [OG-200](OG-200-design-system-v2.md) |
| Regras de negócio | RN-UI-02 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ler HUD, chat e placar com a mesma fonte nítida dos menus.

## Contexto
- `game/render/draw-list.ts`, `screens/GameScreen.tsx`, `InfoOverlay.tsx`, `ReplayScreen.tsx` usam fontes bitmap do original.

## Escopo
- HUD, chat, mensagens, placar (Tab), F1–F5 e replay com a fonte da D-35 (texto do Pixi com a fonte carregada, ou overlay HTML onde fizer mais sentido).
- Nitidez em qualquer escala; sem regressão de desempenho (p95 do quadro igual ou melhor).

## Critérios de aceite
- [ ] Nenhum texto da partida usa fonte bitmap; fontes bitmap saem do carregamento.
- [ ] Medição de FPS antes/depois no card; prints.

## Notas técnicas
- Avaliar `BitmapText` do Pixi gerado a partir da fonte web (atlas) para texto que muda todo quadro.

## Notas de implementação
(preenchido durante a execução)
