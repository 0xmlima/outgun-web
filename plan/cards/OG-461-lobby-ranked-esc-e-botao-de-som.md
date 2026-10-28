# OG-461 — Lobby Ranked: Esc tira o lobby da tela e falta o botão de som

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S50 |
| Status | Pronto |
| Dependências | — |
| Issue | [#16](https://github.com/thiagovasconcellos/outgun-web/issues/16), [#17](https://github.com/thiagovasconcellos/outgun-web/issues/17) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador na fila/lobby Ranked, quero que o Esc não me tire do lobby e quero poder desligar a música ali.

## Contexto
- Issues #16 e #17 (unificadas: mesma tela, mesmo jogador, mesma sessão). 2.49.1, desktop/Steam no Linux, jaru.
- #17: Esc no lobby Ranked mostra "a tela do mapa". O `keydown` do Esc em `GameScreen.tsx:309` abre o menu da partida mesmo com o `RankedLobby` por cima.
- #16: depois de entrar no lobby não há como mutar a música. O `MusicButton` só existe na barra do `Shell` e nos menus (`menus.tsx:35`); o `RankedLobby` não tem.

## Escopo
- Esc no lobby Ranked não sai do lobby (fecha só o que estiver aberto nele, ou abre o menu por cima sem esconder o lobby).
- Botão de som (o mesmo `MusicButton`) no lobby Ranked.

## Critérios de aceite
- [ ] Esc no lobby Ranked mantém o lobby na tela.
- [ ] Dá para pausar/mutar a música no lobby Ranked.
- [ ] PO confere.

## Notas de implementação
(preenchido durante a execução)
