# OG-293 — HUD com escala pela resolução e layout em faixa (chat na largura toda, minimapa na linha do jogo)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S25 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | RN-UI-05, RN-UI-06 |
| Skills | `outgun-card-workflow` |

## História
Como jogador numa tela grande, quero que o chat, o placar e a barra de baixo cresçam junto com a tela, para que o HUD mantenha as proporções de 640×480 em vez de ficar minúsculo.

## Contexto
- Hoje `screenLayout` (`apps/web/src/game/hud/screen-layout.ts`) escala a área de jogo e o minimapa por `largura/640`, mas o texto do HUD fica fixo em 16 px: em 1600×1200 uma linha ocupa 1,6% da altura (2,5% em 640×480), em 2048×1536, 1,2%.
- Protótipo aprovado pelo PO em 2026-10-16: `plan/specs/hud-resolucoes/prototipo-hud-resolucoes.html` (D-54).

## Escopo
- Escala do HUD `u = max(1, arred½(min(H, L·¾) / 700))`: todo texto, linha, barra e espaçamento do HUD multiplicado por `u` (fonte bitmap escalada; 1×/2×/3× nítidas, ½ com filtro linear).
- Modo **faixa** (L/H < 1,5): chat na largura toda da tela, faixa com `max(7·19u + 6u, 0,22·H)`; área de jogo com a altura que sobra (`mul = (H − chat − barra)/354`), alinhada à esquerda; minimapa começando em `playfield.y`, na largura da coluna (−8u), altura do mapa 4×3 ocupando a largura, limitada para o placar caber; placar do minimapa até o FPS.
- Barra de baixo: `3·(16u+2u)+5u`; legendas e valores na escala `u`. `chatLines` com `19u` por linha.
- Sem minimapa (F12) continua como hoje, com o texto na escala `u`.
- Atualizar `plan/specs/hud.md` (regras da versão web, divergência e vetores de teste).

## Critérios de aceite
- [ ] Vetores de teste em `screen-layout.test.ts` batem com o protótipo: 1024×768 (u 1, área 720×540 em y 169), 1280×960 (u 1,5, área 880×660), 1440×1080 (u 1,5, área 1004×753), 1600×1200 (u 1,5), 2048×1536 (u 2, área 1440×1080).
- [ ] O chat mostra pelo menos 6 mensagens + a digitação e ocupa a largura toda.
- [ ] A área de jogo continua mostrando exatamente uma sala (472×354 unidades).
- [ ] Capturas do `pnpm visual:check` regravadas com o novo layout e conferidas numa partida online.

## Notas técnicas
- `ScreenLayout` ganha `ui` (escala) e `mode`; o `HudRenderer` passa a escala ao `text()` (BitmapText com `scale`).

## Notas de implementação
