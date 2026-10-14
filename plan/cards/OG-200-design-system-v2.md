# OG-200 — Design system v2: fonte única, tokens e componentes base

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S13 |
| Status | Em andamento |
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
- [ ] Todos os componentes base existem, com testes de navegação por teclado.
- [ ] Nenhuma opção permite trocar a fonte da interface; prefs antigas com `menuFont` carregam sem erro.
- [ ] Contraste texto/fundo ≥ 4,5:1 em todos os tokens de texto (teste automatizado).
- [ ] Fonte e licença listadas nos créditos; `pnpm check:licenses` verde.
- [ ] Prints da página `/dev/ui` em desktop e celular.

## Notas técnicas
- As telas ainda não migradas continuam com o visual antigo até OG-201–OG-203; o `BitmapText` só sai quando a última tela migrar (e o HUD no OG-205).
- Sem framework de CSS novo: CSS com tokens basta (decisão técnica do card; registrar se mudar).

## Notas de implementação
(preenchido durante a execução)
