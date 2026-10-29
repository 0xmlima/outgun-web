# OG-507 — Lobby Ranked: Esc não sai da sala (app da Steam)

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
Como jogador no lobby Ranked, quero sair da sala com o Esc, sem precisar fechar e abrir o jogo.

## Contexto
- Achado do PO (2026-10-29, 2.53.0, app da Steam): o Esc não tira do lobby; o PO precisou fechar o jogo. Outros jogadores entraram e saíram normalmente.
- O OG-461 desligou de propósito o Esc com o lobby na tela (`GameScreen.tsx:308`, `if (menuOpen || inLobby) return`), porque ele abria o menu da partida por cima do lobby (issue #17). Sair ficou só no botão "Sair da sala". O desktop (`apps/desktop/main.js:169`) não intercepta o Esc.
- A confirmar com o PO: se o botão "Sair da sala" também falhou nessa vez (aí há um segundo bug, não reproduzido).

## Escopo
- Esc no lobby Ranked faz o mesmo que "Sair da sala" (fases aguardando/votação/prontos; na contagem e no fim da série, o mesmo que os botões da fase), sem abrir o menu da partida.
- Esc continua fechando primeiro o que estiver aberto no lobby (pedido de troca, campo do chat com texto).

## Critérios de aceite
- [ ] Esc no lobby Ranked sai da sala (web e desktop).
- [ ] Esc com o chat focado só limpa/desfoca o campo.
- [ ] PO confere no app da Steam.

## Notas de implementação
