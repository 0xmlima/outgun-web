# OG-332 — Quem caiu no Ranked não consegue voltar à partida (409)

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S35 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | RN-RKL-20, D-43, D-46 |
| Skills | `outgun-card-workflow` |

## História
Como jogador do Ranked que caiu no meio do jogo, quero voltar à minha vaga em vez de deixar o bot jogando no meu lugar.

## Contexto
- Achado do beta em 2026-10-21: na md1 `r-72n5xb2a` (3x3), cinco jogadores caíram às 02:22 e ninguém conseguiu voltar; a sala ficou com bots. `POST /rooms/:id/join` respondia `409 room_in_game` ("the match is in progress").
- O game server já devolve a vaga (`Room.resume`, OG-262: pela mesma conta, inclusive tirando o bot substituto), mas a API barrava qualquer entrada em sala de lobby com `phase = game` antes de olhar quem pedia.

## Escopo
- Roster do heartbeat com `replacedAccountId` no bot substituto (conta de quem ele substitui).
- `join`: com o jogo em andamento, entra quem está no roster (vaga guardada) ou foi substituído por bot; quem volta não esbarra em "sala cheia". Série encerrada (`finished`) e quem não estava na partida continuam recusados.

## Critérios de aceite
- [x] Teste de rota: vaga guardada e vaga com bot substituto entram com o jogo em andamento; outra conta recebe `room_in_game`; série encerrada recusa.
- [ ] PO confere no beta: cair no meio de uma ranqueada e voltar pela lista de salas.

## Notas de implementação
- Quem perdeu a vaga ("com um a menos") não aparece no roster e continua recusado, como manda a D-43.
