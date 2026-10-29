# OG-505 — Lobby Ranked: tirar o botão de som e respeitar a música pausada/mutada

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-461 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador que deixou a música desligada no menu, quero que ela continue desligada ao entrar no lobby Ranked, sem precisar de um botão de som ali.

## Contexto
- Achado do PO (2026-10-29, 2.53.0): o pedido da issue #16 era o lobby respeitar a configuração do jogador; o `MusicButton` que o OG-461 pôs no lobby (`.ranked-music`, `RankedLobby.tsx:141`) só atrapalha.
- Causa provável: `MusicPlayer.setMode('match')` (`app/music/player.ts:82`) desfaz a pausa feita na barra de cima ("a partida casual volta a ter música"). O mudo das opções (`prefs.musicMuted`) já é respeitado.

## Escopo
- Remover o botão de som do lobby Ranked (e o `.ranked-music` do CSS).
- A pausa da barra de cima vale também no lobby (e na partida que vem dele); trilha desligada ou muda nas opções continua desligada/muda.

## Critérios de aceite
- [ ] Sem botão de som no lobby Ranked.
- [ ] Música pausada ou muda no menu continua assim ao entrar no lobby Ranked.
- [ ] PO confere.

## Notas de implementação
