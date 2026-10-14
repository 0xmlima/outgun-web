# OG-205 — Fonte única dentro da partida (HUD, chat, placar e overlays)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S14 |
| Status | Em revisão |
| Dependências | [OG-200](OG-200-design-system-v2.md) |
| Regras de negócio | RN-UI-02 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ler HUD, chat e placar com a mesma fonte nítida dos menus.

## Contexto
- `game/render/draw-list.ts`, `screens/GameScreen.tsx`, `InfoOverlay.tsx`, `ReplayScreen.tsx` usam fontes bitmap do original.

## Escopo
- HUD, chat, mensagens, placar (Tab), F1–F5 e replay com a Inter (D-35) (texto do Pixi com a fonte carregada, ou overlay HTML onde fizer mais sentido).
- Nitidez em qualquer escala; sem regressão de desempenho (p95 do quadro igual ou melhor).

## Critérios de aceite
- [x] Nenhum texto da partida usa fonte bitmap; fontes bitmap saem do carregamento.
- [ ] Medição de FPS antes/depois no card.

## Notas técnicas
- Avaliar `BitmapText` do Pixi gerado a partir da fonte web (atlas) para texto que muda todo quadro.

## Notas de implementação
- Canvas (HUD, chat, placar, nomes): `loadFont()` instala a Inter 500 / 13 px como atlas `BitmapFont` do PixiJS (Latin-1, resolução = `devicePixelRatio`); o HUD e as entidades desenham em pixels de tela, então o texto fica nítido em qualquer escala. Sem fonte de contorno: o HUD usa o caminho que já existia (texto deslocado).
- Overlays HTML (F1–F5, aviso, dica, menu Esc): texto comum na Inter; menu Esc virou `MenuList` num `Panel` (com "Ver relatório" do OG-214).
- Saíram `ui/Menu.tsx`, `BitmapText`, `fonts.tsx`, `bitmap-font.ts` (+ teste), o `FontProvider` e a escala `--px` (640×480) da raiz; o CSS da partida passou aos tokens.
- O pipeline de assets ainda gera as fontes do original no manifesto (o cliente não carrega mais); tirar do build fica como limpeza futura.
