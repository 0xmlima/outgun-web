# OG-370 — Inputs com número de sequência: toda mudança de controle chega ao servidor

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S39 |
| Status | Pronto |
| Dependências | OG-369 |
| Regras de negócio | D-71 |
| Skills | `outgun-card-workflow` |

## História
Como jogador competitivo, quero que cada tecla que aperto chegue ao servidor, para que o boneco faça exatamente o que eu mandei, inclusive em trocas rápidas de direção.

## Contexto
- Hoje o cliente manda os controles a 10 Hz (`sendFrame`) e permite **um só reenvio por frame** no meio do frame (`setControls`, `packages/netcode/src/session.ts:780`), e só se ainda der tempo de pegar o mesmo tick do servidor (janela de 0,5 frame). Uma segunda mudança no mesmo frame (ex.: ↑ e depois → para a diagonal, 20 ms depois) espera o próximo envio: até 100 ms com o controle errado no servidor.
- Pior: a mudança que não é reenviada também não entra no `controlHistory`, então a **predição desenha o boneco com o controle antigo** até o próximo envio. É atraso visível na própria tela, sem relação com o ping.
- O servidor aplica sempre o último `input` recebido no tick (`apps/game-server/src/room.ts:931`), então mandar mais vezes não muda a física, só deixa de perder mudanças.

## Escopo
- Protocolo (versão 5): `input` ganha um número de sequência próprio (u8 ou u16) separado do `clientFrame`; o servidor devolve no frame o último `seq` aplicado naquele tick. O `clientFrame` continua medindo o atraso e sincronizando o envio (`frameOffset`, `netsendAdjustment`).
- Cliente: toda mudança de controles é enviada na hora (sem limite de um reenvio), juntando mudanças do mesmo milissegundo; o envio de 10 Hz continua como "batimento" (repete o estado atual).
- Predição: o histórico passa a ser por tick previsto — para cada tick ainda não confirmado, os controles que o servidor terá aplicado (o último enviado antes da chegada estimada). O controle atual vale já no quadro seguinte da tela.
- Servidor: limite de taxa do `input` sobe (hoje 30/s, rajada 60) para comportar ~20 mudanças/s + batimento; o anti-cheat continua expulsando acima disso.
- D-71 na seção 12; atualizar `plan/specs/predicao-interpolacao.md` e `entrada-servidor.md`.

## Critérios de aceite
- [ ] Duas mudanças no mesmo frame (↑ e depois ↑→) chegam ao servidor e o tick seguinte usa a última.
- [ ] O boneco previsto reage à tecla no próximo quadro, sem esperar o envio de 10 Hz (tecla→tela do OG-369 cai).
- [ ] Correções da predição (`stats.corrections`) não aumentam na partida de teste com bots.
- [ ] Testes de `session.test.ts` e `prediction.test.ts` regravados para o protocolo 5.

## Notas técnicas
- O site e o cliente desktop carregam a mesma versão (D-58): basta subir servidor e site juntos; conferir como o servidor trata um cliente com protocolo 4 (aba aberta antes do deploy) e dar a mensagem de "atualize".
- Os replays gravam `PROTOCOL_VERSION` no prefixo (`replay.ts:51`): os replays já gravados (protocolo 4) têm de continuar tocando — o `input` não vai no replay, mas confirmar o leitor.
- Não muda `packages/sim`.

## Notas de implementação
(preenchido durante a execução)
