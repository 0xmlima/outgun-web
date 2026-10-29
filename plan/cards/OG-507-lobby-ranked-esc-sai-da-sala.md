# OG-507 — Lobby Ranked: Esc não sai da sala e o botão "Sair da sala" não parece botão

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S54 |
| Status | Concluído |
| Dependências | OG-461 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador no lobby Ranked, quero sair da sala com o Esc, sem precisar fechar e abrir o jogo.

## Contexto
- Achado do PO (2026-10-29, 2.53.0, app da Steam): o Esc não tira do lobby; o PO precisou fechar o jogo. Outros jogadores entraram e saíram normalmente.
- O OG-461 desligou de propósito o Esc com o lobby na tela (`GameScreen.tsx:308`, `if (menuOpen || inLobby) return`), porque ele abria o menu da partida por cima do lobby (issue #17). Sair ficou só no botão "Sair da sala". O desktop (`apps/desktop/main.js:169`) não intercepta o Esc.
- O PO não achou o botão "Sair da sala": ele é `variant="ghost"` (fundo transparente, sem borda) logo abaixo do "2 de 6 jogadores" e parece texto solto (na captura, entre o status e o radar).

## Escopo
- "Sair da sala" com cara de botão (`secondary` com borda, ou ícone + texto), num lugar fixo e fácil de achar no lobby, com a dica "Esc".
- Esc no lobby Ranked faz o mesmo que "Sair da sala" (fases aguardando/votação/prontos; na contagem e no fim da série, o mesmo que os botões da fase), sem abrir o menu da partida.
- Esc continua fechando primeiro o que estiver aberto no lobby (pedido de troca, campo do chat com texto).

## Critérios de aceite
- [x] Botão "Sair da sala" visível como botão em todas as fases.
- [x] Esc no lobby Ranked sai da sala (web e desktop).
- [x] Esc com o chat focado só limpa/desfoca o campo.
- [ ] PO confere no app da Steam.

## Notas de implementação
- O botão vai para o topo da coluna do meio (`secondary`, com `<kbd>Esc</kbd>`), sempre no mesmo lugar. No fim da série ele vira "Menu principal", e o "Menu principal" da fase continua lá.
- O Esc é tratado no próprio `RankedLobby` (o da `GameScreen` segue desligado no lobby, OG-461). Com o chat focado, o primeiro Esc limpa o texto e o segundo tira o foco. Com um pedido de troca recebido, o Esc recusa. Fora isso, sai da sala.
