# OG-533 — Espectador assiste até o fim: a sala não derruba quem ainda está no atraso

| Campo | Valor |
|---|---|
| Épico | E6 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S57 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | RN-CUP-09 |
| Skills | `outgun-card-workflow` |

## História
Como quem transmite a OutCup, quero ver o fim da partida decisiva, a captura final e o placar, para não perder justamente o momento mais importante.

## Contexto
- Pedido do PO em 2026-11-01: a OutCup será transmitida e o espectador acaba quando a partida termina.
- Causa: no fim da série (Ranked/OutCup) a sala marca `finished` assim que passa o `gameEndDelay` (10 s, `apps/game-server/src/room.ts:1384-1393`); `RoomManager.tickAll` fecha a sala no tick seguinte (`rooms.ts:199`) e `Room.close()` chama `spectators.close()` (`room.ts:2496`), que fecha as conexões na hora. Quem assiste está `spectating_delay` segundos atrás: com 30 s perde os últimos ~20 s de jogo e o placar; com 15 s (OG-534) ainda perderia ~5 s e o placar.
- O mesmo vale para a sala fechada por ficar vazia (`'empty'`) logo depois do fim, para o `draining` (sala Casual encerrada) e para a sala de treino.

## Escopo
- Ao fechar uma sala com espectadores, o `SpectatorStream` continua vivo até entregar o último bloco da última partida (mais alguns segundos para o placar final aparecer), e só então fecha as conexões, com código 1000 e motivo "partida encerrada".
- O relógio do stream não pode depender de `world.frame` avançar depois do fim: o servidor segue contando o tempo de parede (10 frames/s) para os espectadores pendentes. Conferir também o intervalo entre os jogos de uma série (fase `lobby`/`vote`): o espectador não pode ficar parado no meio do jogo anterior.
- O `RoomManager` remove a sala da lista (ninguém entra como jogador) mas mantém o "rabo" dos espectadores; desligamento do servidor (`shutdown`) continua fechando na hora.
- Cliente (`SpectateScreen`): no fim do stream, em vez de "Desconectado", manter a última imagem (placar final) e mostrar "Partida encerrada" com botão Voltar. Na série, mostrar o placar da série se já houver.

## Critérios de aceite
- [x] Teste do `SpectatorStream`/`Room`: série md3 termina, a sala é encerrada e o espectador ainda recebe todos os blocos até o `gameOver` do último jogo antes de a conexão fechar.
- [x] Mesmo teste com a sala esvaziada logo após o fim (`'empty'`).
- [x] Espectador que entra entre dois jogos da série vê o fim do jogo anterior e o começo do seguinte, sem travar.
- [x] No cliente, o fim do stream mostra "Partida encerrada" e não um erro.

## Notas técnicas
- Ideia: `RoomManager` guarda as streams "órfãs" (`SpectatorStream.drain(lastFrame)`) e chama `tick` com um contador próprio até `target > lastFrame + folga`; ou a `Room` passa a ter um estado "encerrada, só espectadores" que não roda a sim.
- O `/spectate` de uma sala já fechada deve responder `reject` claro, não pendurar.

## Notas de implementação
- O stream agora anda pelo relógio da sala (`uptimeFrames`, que corre na pausa e no lobby) e não por `world.frame`: o atraso é de tempo de verdade e o espectador não congela entre os jogos da série.
- `RoomManager.close` (fim ou sala vazia) tira a sala da lista e a guarda em `tails`; `Room.drainSpectators()` entrega o atraso + 10 s e fecha com 1000 "partida encerrada". Desligar o servidor fecha na hora. O socket do espectador guarda a sala, não o id.
- Cliente: código 1000 → "A partida terminou." com Voltar; a última imagem fica. Pendência: o `gameOver` sai depois do `stop_recording`, então nem replay nem espectador mostram o modal do placar (só o placar do HUD).
