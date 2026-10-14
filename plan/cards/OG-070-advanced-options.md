# OG-070 — Opções gráficas e de jogo avançadas do original

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Could |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Concluído |
| Dependências | [OG-068](OG-068-player-options.md) |
| Regras de negócio | — |
| Skills | `outgun-re-spec` |

## História
Como jogador veterano, quero as opções gráficas finas do original para deixar a tela como eu jogava.

## Contexto e referências no original
- Inventário em `plan/specs/opcoes-jogador.md` (itens ⏳): `Menu_graphics` (`src/client_menus.cpp:515-600`) e partes de `Menu_game`/`Menu_theme`.
- Desenho em `src/guiclient.cpp` e `src/graphics.cpp` (cada opção).

## Escopo
- Gráficos: Scrolling, Antialiasing, Less transparency effects, Disappeared players on minimap, Highlight returned and dropped flags, Make flags extra-visible, Show flag disappearance positions, Highlight self after spawn, Markers for nearby players and flags, Box visible area on map, Let view follow over map border, Allow parts of map to repeat, Highlight maps not in maps.txt, Stats screen alpha, Map info mode; Ctrl+F3 alterna os nomes.
- Jogo: Stay dead when in a menu at round start (precisa de mensagem ao servidor), Underline players with account.
- Tema: Background theme / Prefer main theme background (imagem de fundo dos menus).
- Rooms on screen in replay fica com os replays (OG-091).

## Critérios de aceite
- [x] Cada opção do escopo implementada com o default do `client.cfg` distribuído e comparada com print do original.

## Notas técnicas
- O renderer já desenha o comportamento padrão de cada opção; o card só acrescenta as alternativas.

## Notas de implementação
- Spec: `plan/specs/opcoes-graficas.md` (fontes, padrões do `client.cfg` distribuído por índice, algoritmo, divergências); `opcoes-jogador.md` atualizada.
- Preferências novas (padrões = `client.cfg` distribuído, D-05), sincronizadas com a conta como as outras, e o objeto `GraphicsOptions` (`apps/web/src/game/graphics-options.ts`) que o jogo recebe por `setClient`.
- Gráficos: rolagem, vista sobre a borda e repetição do mapa (o port de `getViewStartCoord`/`mapWraps` já existia; agora seguem as opções e o "dá a volta" de cada mapa), jogadores sumidos no minimapa (fade/cedo/tarde), piscar de bandeira devolvida, bandeiras enfatizadas (never/multi-roomed/always), posições onde a bandeira sumiu (minimapa e sala, com os segundos sem notícia), destaque ao nascer, marcadores de vizinhos, caixa da área visível (também com rolagem), menos transparência (névoa sólida no minimapa, sem rastro de turbo e sem círculo do portador do deathbringer, fumaça opaca e menor), mapas fora do jogo destacados na lista F2, alfa do fundo das telas F1–F5 e modo de informação do mapa (áreas de respawn, pontos de spawn, grade 16×12 pintados no fundo das salas).
- Jogo: ficar morto no menu (`ClientSession.holdReady`/`releaseReady`: o `clientReady` da troca de mapa espera o menu do jogo fechar) e sublinhado no placar de quem tem conta (`playerInfo.loggedIn`).
- Tema: fundo da tela em mosaico (`background` do tema; "Prefer main theme background").
- **Divergências silenciosas corrigidas:** a web piscava bandeiras devolvidas, desenhava os marcadores de vizinhos e as posições de bandeiras sumidas sempre e enfatizava as bandeiras com mais de uma sala — no `client.cfg` distribuído as quatro vêm desligadas; agora seguem as opções (padrão desligado, como o original).
- Não se aplicam: Antialiasing (o canvas do navegador sempre suaviza), Underline server-authenticated (sem `auth.txt` na web), Rooms on screen in replay (player de replay, OG-091).
- Comparação com o original (oráculo, `--cfg` no replay): prints em `tools/parity/out/og070/` — `original-enfase.png` × `web-enfase.png` (quatro triângulos), `original-metal.png` × `web-online-metal.png` (fundo estrelado em volta das salas), `web-info-mapa.png` (modo de informação, que o original não grava no `client.cfg`).
- Testes: `graphics-options.test.ts` (padrões, valores inválidos, fade, ênfase, marcadores) e `session.test.ts` (clientReady segurado).
