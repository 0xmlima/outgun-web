# OG-316 — Lobby do Ranked com o tema dos menus (Campo ou Placar)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S29 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador do Ranked, quero que o lobby da sala tenha o mesmo visual dos menus, para o jogo parecer um produto só.

## Contexto
Achado ao verificar o HUD do Ranked (2026-10-17) e pedido do PO: o lobby fica dentro da tela da partida, fora da moldura dos menus (`Shell`, `data-menu-theme`), e por isso usava os tokens azuis antigos em vez do tema Campo (D-53).

## Escopo
- O lobby leva o tema escolhido em Opções › Gráficos › Menus (`data-menu-theme`).
- Campo: fundo com o mapa e quinas em L nos painéis, como os menus. Placar: o mesmo fundo dos menus Placar.

## Critérios de aceite
- [x] Lobby com o tema Campo, conferido numa sala Ranked de verdade (homologação local).
- [x] Teste dos temas (`menu-themes.test.ts`) passando.

## Notas técnicas
## Notas de implementação
- `RankedLobby` com `data-menu-theme={prefs.menuTheme}`; em `theme-campo.css`, fundo do mapa no `.ranked-lobby` e as quinas do `.ui-panel` também nos painéis do lobby; em `theme-placar.css`, o fundo do `.app-shell` vale para o `.ranked-lobby`.
- No ar desde 2026-10-17 (deploy do `s29`, commit 08c4e79; backup antes; partida de convidado conferida).
