# OG-505 — Lobby Ranked: tirar o botão de som e respeitar a música pausada/mutada

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S54 |
| Status | Em revisão |
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
- [x] Sem botão de som no lobby Ranked.
- [x] Música pausada ou muda no menu continua assim ao entrar no lobby Ranked.
- [ ] PO confere.

## Notas de implementação
- Causa: `setMode('match')` retomava a pausa de propósito, e a faixa nova da partida (o tema do menu não entra nela) sempre dava `play()`. Agora a pausa vale em todas as telas e a faixa nova fica pronta e calada até o jogador retomar (teste em `player.test.ts`).
- Efeito colateral aceito: quem pausar no menu entra na partida Casual sem música e retoma pela barra de cima ou pelo tocador.
