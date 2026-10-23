# OG-406 — Cliente escolhe WebTransport e cai no WebSocket sem o jogador perceber

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Em revisão |
| Dependências | OG-405 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que o jogo use o melhor transporte que meu navegador ou o app suportam, sem eu precisar configurar nada.

## Contexto
- WebTransport é Baseline desde março de 2026; navegador antigo ou rede que bloqueia UDP continua no WebSocket.

## Escopo
- O cliente tenta WebTransport (tempo limite curto) e cai no WebSocket; reconexão segue a mesma regra.
- Telemetria de rede (OG-369) e o painel de rede mostram o transporte e a perda.
- Opção avançada para forçar WebSocket.

## Critérios de aceite
- [ ] Chrome, Firefox, Safari 26.4+ e o app desktop jogam por WebTransport; com UDP bloqueado, WebSocket sem erro visível.

## Notas de implementação
