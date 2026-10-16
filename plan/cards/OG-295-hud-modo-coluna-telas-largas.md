# OG-295 — HUD em telas largas: modo coluna (16:9 e 16:10)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S25 |
| Status | Concluído |
| Dependências | [OG-293](OG-293-hud-escala-layout-faixa.md), [OG-294](OG-294-placar-borda-a-borda.md) |
| Regras de negócio | RN-UI-05, RN-UI-06 |
| Skills | `outgun-card-workflow` |

## História
Como jogador num monitor 16:9, quero ver o chat inteiro e uma área de jogo grande, para não ficar com uma linha de chat como hoje.

## Contexto
- Hoje em 1920×1080 e 2560×1440 a sala ocupa 93–95% da altura e o chat fica com 1 linha. Protótipo aprovado (D-54).

## Escopo
- L/H ≥ 1,5 → modo **coluna**: área de jogo com a altura toda menos a barra; coluna da direita com largura mínima para os dois times lado a lado e 40 caracteres de chat.
- Chat (7 mensagens + digitação) no alto da coluna; minimapa logo abaixo; placar lado a lado de borda a borda até o FPS.
- Se a sala parar pela largura e sobrar ≥ 4 linhas em cima (16:10, ex. 1440×900), o chat volta à faixa de cima na largura toda e o minimapa começa em `playfield.y`.

## Critérios de aceite
- [x] 1920×1080: u 1,5, área 1313×985, placar lado a lado. 2560×1440: u 2. 1440×900: chat em cima (3 mensagens + digitação), área 888×666.
- [x] Vetores no `screen-layout.test.ts`.

## Notas técnicas
## Notas de implementação
- Modo `coluna` em `screenLayout` (L/H ≥ 1,5); escala do placar escolhida pela maior que deixe o minimapa com 20% da altura (25% da sobra no caso 16:10). `ScreenLayout.chatChars` dá a largura do chat em caracteres.
- `MessageFeed.visible(..., width)` quebra de novo as linhas (já cortadas em 79) quando o chat é mais estreito; o histórico continua guardado em 79.
