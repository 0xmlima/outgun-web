# OG-060 — Shell React e menus

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S6 |
| Status | Concluído |
| Dependências | [OG-001](OG-001-monorepo-setup.md) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero menus rápidos e com a cara do Outgun, para entrar em uma partida em poucos cliques.

## Contexto e referências no original
- `src/client_menus.h` (Menu_main, serverList, options, player, game, controls, graphics, sounds, language, replays, help).
- `doc/menus.html`.
- `graphics/Ice/colours.txt` (cores de menu).

## Escopo
- Vite + React + Router; telas: início (jogar agora / lobby / replays / opções / ajuda / créditos), login/cadastro (placeholder até OG-081).
- Canvas do jogo montado numa rota dedicada; React só para overlays.
- Estilo retrô com tokens de tema.
- Tela de créditos com `ORIGINAL_CREDITS` de `@outgun/content` e link "Código-fonte (GPL)" no rodapé de todas as telas (vindos do OG-005).

## Critérios de aceite
- [x] Lighthouse performance ≥ 90 na tela inicial.
- [x] Navegação completa por teclado.
- [x] Tela de créditos e link para o código-fonte visíveis sem login.

## Notas técnicas
- —

## Notas de implementação
- **Stack:** Vite 8 + React 19 + React Router 8 (`createBrowserRouter`), tudo MIT. `apps/web` deixou de ser biblioteca: `build` = typecheck + `vite build`. A rota `/play` é carregada sob demanda (o PixiJS do OG-061 entra nesse pedaço, sem pesar na tela inicial).
- **Telas:** início (Jogar agora, Salas e Replays desabilitados com "Em breve", Opções, Ajuda, Créditos, Entrar), Opções (idioma e fonte dos menus; Controles desabilitado até o OG-063), Ajuda (texto `help` do idioma, OG-014), Créditos (`ORIGINAL_CREDITS`), Entrar (placeholder: só "Jogar como convidado" até o OG-081), `/source` (explica a GPL) e `/play` (canvas + menu do Esc). Rota desconhecida volta ao início.
- **Cara do original:**
  - cores dos menus como tokens CSS a partir de `graphics/Ice/colours.txt` (`src/styles.css`);
  - textos desenhados com as fontes bitmap do original (OG-013) em canvas, tingidos pela cor CSS, em escala inteira (`--px` = maior inteiro em que 640x480 cabe na janela, até 4) e sem suavização; o texto real fica num `<span>` oculto para leitores de tela;
  - fonte padrão **Kulmikas** (monoespaçada, alinha as colunas da ajuda), trocável em Opções e salva no navegador. O original usa a fonte embutida 8x8 da Allegro, que não está entre as 25 convertidas;
  - sem os assets (`pnpm assets`), cai para uma fonte CSS monoespaçada.
- **Teclado** (`ui/menu-nav.ts`, regras de `doc/menus.html`): setas/Tab/Shift+Tab movem pulando itens desabilitados e dão a volta; Home/End; Enter/Espaço ativam; esquerda/direita mudam valores; o número à esquerda ativa o item; Esc volta. Páginas de texto rolam com setas, PageUp/PageDown, Espaço, Home/End, e Tab chega ao link do código-fonte. No jogo, Esc abre o menu (como no original).
- **Canvas do jogo:** `game/host.ts` (`mountGame`) é dono do canvas e do laço de quadros; o React só monta o elemento e desenha overlays. Por ora desenha o contorno da área de jogo 472x354; o OG-061 troca pelo renderer.
- **Link "Código-fonte (GPL)"** no rodapé de todas as telas de menu e nos créditos, sem login. Aponta para `VITE_SOURCE_URL` quando definido; até existir o repositório público, abre `/source`.
- **i18n:** textos novos em inglês com tradução pt-BR em `packages/i18n/src/web-texts.ts`; fi/it mostram o inglês nesses textos (os do original continuam traduzidos).
- **Verificação:**
  - Lighthouse 13 na tela inicial (build de produção, `vite preview`): Performance **99**, Acessibilidade **100**, Boas práticas 96 (FCP 1,7 s, TBT 0 ms, CLS 0);
  - roteiro de teclado no Chrome headless (puppeteer-core, fora do repo) percorreu início, opções (troca de idioma e de fonte), créditos, ajuda, jogo e Esc, e login sem erros no console. O roteiro achou e corrigiu um bug: trocar o idioma recriava os itens e o foco se perdia;
  - testes: `bitmap-font.test.ts` (leitura do .fnt, medida, quebra de linha) e `menu-nav.test.ts` (teclas).
  - Prints em `tools/parity/out/prints/og060-*.png`.
- **Fora do escopo / próximos:** bundle inicial de 144 KB gzip, a maior parte catálogos dos 4 idiomas mais react-dom. Carregar o idioma sob demanda pode ser feito se o orçamento apertar.
- Branch: `og-060-web-shell`.
