# OG-201 — Novo menu principal e moldura das telas

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S13 |
| Status | Em revisão |
| Dependências | [OG-200](OG-200-design-system-v2.md) |
| Regras de negócio | RN-UI-01, RN-UI-04 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero um menu principal moderno, em que "Jogar" esteja a um clique, para entrar numa partida rápido e achar o resto sem procurar.

## Contexto
- `screens/menus.tsx` (`HomeScreen`) e `app/Shell.tsx`: lista numerada no estilo do `src/menu.cpp` original.

## Escopo
- Nova moldura (`Shell`): barra superior com logo, navegação (Jogar, Salas, Ranking, Replays) e chip da conta (entrar / nome + clã); rodapé discreto com Sobre, Termos, Privacidade e código-fonte (GPL, OG-005).
- Tela inicial: chamada principal "Jogar agora" (Casual), atalhos para salas, sala privada e últimas partidas do jogador; Opções, Ajuda, Créditos, Feedback e Moderação conforme o papel.
- Fundo com identidade do jogo (ex.: mapa desfocado ou arte do tema) sem prejudicar a leitura.
- Navegação completa por teclado e gamepad, como hoje; mouse e toque como primeira classe.
- Ponto de início da trilha do menu (OG-221).

## Critérios de aceite
- [x] Todas as ações do menu atual continuam acessíveis (E2E percorre cada uma).
- [x] "Jogar agora" funciona com e sem conta (beta fechado leva ao login, como hoje).
- [x] Funciona em 360 px de largura sem rolagem horizontal.
- [x] Prints desktop e celular, com e sem conta.

## Notas técnicas
- Rotas não mudam: links já compartilhados continuam válidos.

## Notas de implementação
- **Moldura** (`app/Shell.tsx`, `app/shell.css`): barra superior com logo (a bandeira do favicon), "Jogar agora" (RN-UI-04: a um clique de qualquer tela), Salas, Ranking e Replays (`NavLink`, com a página atual marcada) e o chip da conta ("Entrar" ou avatar + `[clã] nome`, que leva a `/account`). No celular a navegação vai para uma segunda linha rolável. Rodapé discreto com Sobre, Termos, Privacidade e Código-fonte (GPL). Gamepad ligado na moldura (OG-200); LB/RB agora pulam de controle (Shift+Tab/Tab), para sair da lista e chegar à barra ou à tabela.
- **Fundo:** sem imagem (nada a baixar): brilho vermelho e azul das bases nos cantos sobre a grade das salas, em CSS. Decidi assim em vez de mapa desfocado para não pesar no carregamento inicial nem competir com o texto.
- **Tela inicial** (`HomeScreen` em `screens/menus.tsx`): título, frase do jogo e um `MenuList` em grade (1 coluna no celular, 2 no desktop) com "Jogar agora" em destaque (item `primary`, novo no `MenuList`) e as mesmas ações de antes: Salas, Criar sala privada (convidado vai ao login, com o selo "exige conta"), Ranking, Replays, Opções, Ajuda, Créditos, Enviar feedback e Moderação conforme o papel, Conta/Entrar. Atalhos 1..0, setas, Enter e foco inicial em "Jogar agora", como antes. Com conta, painel "Suas últimas partidas" (5, da API do perfil; linha leva à partida).
- "Jogar agora" virou o hook `usePlayNow` (`app/play-now.ts`), usado pela barra e pela tela inicial; mesmo comportamento (beta fechado sem conta → `/login`).
- O texto "Play" do catálogo do original está traduzido como "Tocar" (sentido de música); a barra usa "Play now".
- **Telas antigas** continuam com a caixa de menu bitmap, centralizada no conteúdo da moldura nova, até OG-202/OG-203. Rotas não mudaram.
- **Trilha (OG-221):** o ponto de início da música do menu é o `Shell` (monta só nas telas fora da partida).
- **E2E** (`tools/e2e/tests/fluxo.spec.mjs`): teste novo percorre cada ação da tela inicial, da barra e do rodapé, mais o atalho numérico e Enter; seletores do cadastro/admin ajustados (`.app-account`, `.ui-menu-item`, `.app-footer`). Rodam no fechamento da sprint.
- Prints (API simulada no navegador): `tools/parity/out/prints/og-201-inicio-{convidado,conta}-{desktop,celular}.png` (celular a 360 px, sem rolagem horizontal) e `og-201-opcoes-antiga-desktop.png` (tela antiga dentro da moldura nova).
