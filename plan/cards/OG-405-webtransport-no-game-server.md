# OG-405 — WebTransport no game server, com o WebSocket de reserva

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Em revisão |
| Dependências | OG-376 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador com Wi-Fi ou 4G instável, quero que um pacote perdido não segure os seguintes, para não sentir travadinhas.

## Contexto
- Estudo do OG-376 (`plan/reports/OG-376-webtransport.md`): com 3% de perda, p95 dos quadros 122 ms no TCP contra 44 ms nos datagramas.

## Escopo
- `@fails-components/webtransport` (BSD-3) ao lado do uWebSockets.js: quadros e comandos por datagrama, o resto num stream confiável; mesma sala, mesmo protocolo binário.
- Certificado do Caddy (volume `caddy-data`) lido pelo game server, com recarga na renovação; porta UDP no compose, no firewall da VM e na lista de segurança da Oracle (Always Free).
- Métricas por transporte (jogadores, datagramas perdidos).

## Critérios de aceite
- [ ] Partida completa por WebTransport no beta, com o WebSocket funcionando igual.
- [ ] Com perda simulada de 3%, p95 dos quadros perto do sem perda (repetir `tools/load/transport-loss.mjs` contra o game server).

## Notas de implementação
