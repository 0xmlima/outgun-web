# OG-070 — Opções gráficas e de jogo avançadas do original

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Could |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
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
- [ ] Cada opção do escopo implementada com o default do `client.cfg` distribuído e comparada com print do original.

## Notas técnicas
- O renderer já desenha o comportamento padrão de cada opção; o card só acrescenta as alternativas.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
