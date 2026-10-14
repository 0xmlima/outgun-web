# OG-200 — Design system v2: fonte única, tokens e componentes base

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S13 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | RN-UI-01, RN-UI-02, RN-UI-03 |
| Skills | `outgun-card-workflow`, `outgun-asset-pipeline` |

## História
Como jogador, quero uma interface limpa e legível, com uma única fonte bem escolhida, para enxergar e usar os menus sem esforço.

## Contexto
- Hoje os menus imitam o original: fontes bitmap Allegro (`apps/web/src/ui/BitmapText.tsx`, `fonts.tsx`), escala inteira de 640×480 (`app/Shell.tsx`) e a opção "Tema e fonte" (`screens/options.tsx`) que troca entre 25 fontes. Fica datado e difícil de ler.
- Fonte: **Inter** (D-35), variável, licença OFL.

## Escopo
- Fonte única **Inter** (D-35), servida pelo próprio site (woff2, subset latino com acentos pt-BR/fi/it, licença OFL registrada em `CREDITS.md` e no check de licenças).
- Tokens CSS em `:root` (cores, superfícies, texto, destaque, perigo, espaçamentos, raios, sombras, escala tipográfica) em `apps/web/src/ui/`.
- Componentes base: `Button`, `MenuList` (reaproveita `menu-nav.ts`: setas, Enter, Esc, atalhos numéricos e gamepad), `Field` (texto, senha, escolha, alternador, deslizante), `Panel`, `Tabs`, `Table`, `Toast`, `Badge`.
- Layout fluido (sem escala inteira de pixels), legível de 360 px de largura até 4K; contraste AA.
- Remover a escolha de fonte das opções e a pref `menuFont` (migração silenciosa das prefs salvas e do `prefs-sync`).
- Página interna `/dev/ui` (só em desenvolvimento) com todos os componentes, para revisão visual.

## Critérios de aceite
- [x] Todos os componentes base existem, com testes de navegação por teclado.
- [x] Nenhuma opção permite trocar a fonte da interface; prefs antigas com `menuFont` carregam sem erro.
- [x] Contraste texto/fundo ≥ 4,5:1 em todos os tokens de texto (teste automatizado).
- [x] Fonte e licença listadas nos créditos; `pnpm check:licenses` verde.
- [x] Prints da página `/dev/ui` em desktop e celular.

## Notas técnicas
- As telas ainda não migradas continuam com o visual antigo até OG-201–OG-203; o `BitmapText` só sai quando a última tela migrar (e o HUD no OG-205).
- Sem framework de CSS novo: CSS com tokens basta (decisão técnica do card; registrar se mudar).

## Notas de implementação
- **Fonte:** Inter variável do pacote `@fontsource-variable/inter` (OFL-1.1), só o arquivo do subconjunto latino (48 KB, cobre pt-BR/fi/it), declarado em `apps/web/src/ui/tokens.css` e empacotado pelo Vite (servido pelo próprio site; CSP `font-src 'self'` já atendia). `OFL-1.1` entrou na lista do `check:licenses`; créditos em `CREDITS.md` e na tela de créditos (`WEB_CREDITS` em `packages/content/src/credits.ts`, que o OG-220 completa com a música).
- **Tokens** (`ui/tokens.css`): superfícies `--surface-0..3`, bordas, `--text-*`, `--accent`/`--danger` com `--text-on-*`, espaços, raios, sombras, escala tipográfica em rem com fonte-base fluida (`clamp(16px, 0.35vw + 10px, 22px)`: 16 px no celular e no Full HD, ~22 px no 4K). Tema escuro único. Convenção testada em `ui/tokens.test.ts`: todo `--text-*` ≥ 4,5:1 sobre toda `--surface-*` e `--text-on-X` sobre `--X` (menor par: 5,2:1).
- **Componentes** (`ui/`): `Button`/`Badge` (`Button.tsx`), `MenuList`, `TextField`/`ChoiceField`/`ToggleField`/`SliderField`/`FieldGroup` (`Field.tsx`), `Panel`, `Tabs`, `Table` (linhas navegáveis com `onRowActivate`), `ToastProvider`/`useToast` (montado no `Root`). CSS puro com tokens em `ui/components.css`, tudo sob classes `ui-` para não mexer nas telas antigas (decisão técnica: sem framework de CSS).
- **Teclado:** as regras ficam em funções puras testadas (`ui/keys.ts` + `menu-nav.ts`, testes em `ui/keys.test.ts`). `MenuList` reaproveita `menuKey` (setas, Home/End, Enter/Espaço, Esc, atalhos 1..0), mas Tab sai da lista, como numa página web. Num `FieldGroup`, ↑/↓ passam de campo a campo e ←/→ mudam o valor. O deslizante trata as teclas ele mesmo (e não o navegador) para funcionar com o gamepad.
- **Gamepad** (`ui/gamepad.ts`, testes em `gamepad.test.ts`): direcional e analógico viram setas (com repetição), A vira Enter e B vira Esc, entregues como `keydown` ao elemento em foco; Enter que ninguém tratou vira clique. Ligado no `Shell` (telas de menu) e no `/dev/ui`, não na partida.
- **Fonte única:** saíram a opção "Fonte" (o submenu "Tema e fonte" virou "Tema") e a pref `menuFont`; `parsePrefs` ignora o campo nas prefs salvas (navegador e conta), que some no próximo salvamento (teste em `options.test.ts`). As telas antigas e o texto da partida usam a fonte bitmap fixa `GAME_FONT` (`ui/fonts.tsx`) até OG-201–203 e OG-205.
- **`/dev/ui`:** rota só com `import.meta.env.DEV` (fora do build de produção), em `screens/DevUiScreen.tsx`. Conferido com o Chrome headless: Inter carregada, sem rolagem horizontal a 390 px e teclado funcionando na lista, nas abas e entre os campos.
- Prints: `tools/parity/out/prints/og-200-dev-ui-desktop.png` e `og-200-dev-ui-celular.png`.
