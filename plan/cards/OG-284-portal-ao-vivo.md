# OG-284 — Portal ao vivo: novidades empurradas pelo servidor

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Funcionalidade |
| Prioridade | Could |
| Estimativa | 5 pts |
| Sprint | S42 |
| Status | Pronto |
| Dependências | OG-283 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que o portal mostre o que acontece no jogo no instante em que acontece, para sentir o Outgun vivo.

## Contexto
- Ideia do PO (2026-10-15), passo 2 depois do OG-283 (consultas periódicas). Hoje toda tela pergunta à API de tempos em tempos.

## Escopo
- Canal da API para o cliente (SSE ou WebSocket) com eventos do portal: online e salas (do heartbeat), fim de partida e mudança de ranking, convites de clã.
- Telas inscritas trocam as consultas periódicas pelo canal; consulta periódica fica como reserva se o canal cair.
- Avisos leves no portal (ex. "fulano entrou na sala X"), a definir com o PO.
- Medir conexões abertas no teste de carga e no deploy (proxy, limites da VM Always Free).

## Critérios de aceite
- [ ] Online e salas mudam na tela em até ~1 s depois do heartbeat.
- [ ] Canal caído: a tela volta às consultas periódicas sem erro visível.
- [ ] Teste de carga com N conexões abertas dentro dos limites da VM.

## Notas de implementação
(preenchido durante a execução)
