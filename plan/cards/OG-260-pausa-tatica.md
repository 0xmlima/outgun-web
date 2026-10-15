# OG-260 — Pausa tática por time no Ranked (servidor)

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S20 |
| Status | Concluído |
| Dependências | [OG-252](OG-252-salas-lobby-ranked.md) |
| Regras de negócio | RN-RKL-15, RN-RKL-16 |
| Skills | `outgun-card-workflow` |

## História
Como time numa partida Ranked, quero pedir pausas que somem até 60 s, para resolver um problema sem perder o jogo.

## Escopo
- Cada time tem **60 s** de pausa e até **3 pedidos** **por jogo** (ex.: 3 × 20 s; numa série, o saldo zera a cada jogo); qualquer jogador do time pede (comando e tecla, D-45).
- Durante a pausa o servidor não avança o mundo: posições, tiros, bandeiras, timers de respawn e o tempo da partida ficam congelados; chat continua.
- A pausa termina quando o time que pediu retoma ou quando o saldo acaba; o adversário **não** pode retomar nem estender. Retomada sempre com contagem de **3 s** (D-45).
- Mensagens novas em `packages/protocol` (pausado/retomando, quem pediu, saldo e pedidos restantes de cada time).

## Critérios de aceite
- [x] Testes: saldo descontado pelo tempo real de pausa; 4º pedido e pedido sem saldo recusados; o tempo da partida não corre pausado.
- [x] Nenhum avanço do mundo durante a pausa (frame igual antes e depois).
- [x] Pedido de retomada do time adversário é recusado.
- [x] Casual não tem pausa.

## Notas técnicas
- `packages/sim` não muda: a sala só deixa de chamar o passo do mundo. Conferir predição e interpolação do cliente com o mundo parado (sem "pulo" na retomada).

## Notas de implementação
- `apps/game-server/src/pause.ts` (`RankedPause`, só em sala `mode: 'ranked'`); tempos no relógio da sala (`uptimeFrames`). Pausado, a sala **não incrementa `world.frame`**: mundo, timers de respawn/power-up, bandeiras e tempo da partida param juntos sem tocar no `packages/sim`; os frames continuam indo com o mesmo número.
- Pausado, inputs/tiro/largar bandeira/suicídio são ignorados e as teclas de todos são soltas; o prazo de reconexão passou a contar pelo `uptimeFrames` (anda pausado — base do OG-261).
- Protocolo: `pauseState` (126) e `pauseRequest` (127); comandos `/pause` e `/resume` no chat. A tecla e o overlay ficam no OG-264.
- Cliente (`session.ts`): `pause` + `paused`; pausado não extrapola nem prediz e o relógio segue o frame do servidor (sem pulo na retomada). Na entrada da pausa o próprio jogador pode voltar a posição de alguns frames de predição (o servidor manda a posição confirmada).
