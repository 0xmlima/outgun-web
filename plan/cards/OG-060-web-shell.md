# OG-060 — Shell React e menus

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S6 |
| Status | Backlog |
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
- [ ] Lighthouse performance ≥ 90 na tela inicial.
- [ ] Navegação completa por teclado.
- [ ] Tela de créditos e link para o código-fonte visíveis sem login.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
