# OG-291 — Tema de menu "Campo": os menus com a cara do tema padrão da partida

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S23 |
| Status | Em revisão |
| Dependências | [OG-200](OG-200-design-system-v2.md), [OG-201](OG-201-menu-principal-v2.md) |
| Regras de negócio | RN-UI-01, RN-UI-02, RN-UI-03, RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que os menus lembrem o jogo que eu vou jogar, para reconhecer o Outgun já na tela inicial em vez de um painel escuro genérico.

## Contexto
- Pedido do PO em 2026-10-15 (D-53): o design system v2 ficou genérico demais. Das duas direções do protótipo (`plan/specs/menus-tema/prototipo-campo-placar.html`), o PO aprovou a **A · Campo**; a **B · Placar** fica guardada para um tema futuro (OG-292).
- Referência é só o **tema padrão** da partida (sem tema: `manifest.defaultColours`): chão `ground` #104000, paredes `wall` #30C000, mastro `flag_pole` #FFFF00, times vermelho e azul. Os temas legados (Metal, Grid, Grass...) e o menu verde do Allegro ficam de fora.
- **Nada dentro da partida muda** (HUD, placar, minimapa, telas de informação, menus da partida, replay, espectador).

## Escopo
- Tokens do tema numa folha própria, aplicada só dentro da moldura dos menus (`Shell`, `data-menu-theme`); `tokens.css` (`:root`) continua como está.
- Fundo dos menus: um mapa real (Mooca) com as cores da partida, escurecido.
- Painéis com quinas em L na cor da parede; ação principal com quinas cortadas; foco amarelo; item de menu em foco vira bandeira (mastro + quadrado do time).
- Ícones de traço com as formas do jogo nos itens do menu inicial; avatar da conta como o jogador da partida (anel + cor pessoal).

## Critérios de aceite
- [x] Telas fora da partida usam o tema Campo; `/play`, `/spectate` e `/replay` não estão sob ele (rotas fora da `Shell`).
- [x] Todo texto do tema com contraste AA sobre todas as superfícies (teste `theme-campo.test.ts`).
- [x] Fonte única Inter, sem fonte nova (RN-UI-02).
- [x] Navegação por teclado, mouse e gamepad igual à de antes (só CSS e ícones; `MenuList` mantém as teclas).

## Notas técnicas
- `apps/web/src/ui/theme-campo.css` (tokens + ornamentos sob `[data-menu-theme='campo']`), `ui/icons.tsx`, `ui/campo-map.svg` (gerado por `apps/web/scripts/menu-map.mjs` com o parser do jogo).

## Notas de implementação
- O tema redefine os tokens no elemento da `Shell`, não no `:root`: a partida e os avisos (`ToastProvider` fica na raiz, fora da moldura) seguem com os tokens antigos. Por isso os avisos nos menus ainda saem no visual azul; trazer para o tema exige separar o aviso do menu do aviso da partida (fica para quando o PO pedir).
- Fundo: SVG estático de 5,8 KB versionado, em vez de carregar o mapa em tempo de execução. Trocar o mapa: `node apps/web/scripts/menu-map.mjs <mapa>`.
- `MenuList` ganhou `icon` opcional; no menu inicial o selo à direita (ex.: "exige conta") desce para baixo da descrição para não espremer o rótulo.
- Conferido uma vez em 1440×1000 (início e opções) num servidor local, sem API.
