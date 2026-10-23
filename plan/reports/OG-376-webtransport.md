# OG-376 — WebTransport (datagramas) para conexões com perda

Estudo da S42 (2026-10-23). Medição em `plan/specs/medicoes/transporte-perda-s42.json`, script `tools/load/transport-loss.mjs`.

## Medição

Container Linux com `tc netem` no loopback: 40 ms de atraso de ida (±3 ms) e perda de 0 a 3%. Tráfego no ritmo do Outgun: quadros do servidor a 10 Hz (~400 bytes) e comandos do cliente a 20/s, com os 3 últimos repetidos em cada datagrama (o servidor já aceita comando por sequência, OG-370). Métrica: tempo até o cliente ter o dado (o próprio quadro/comando ou um mais novo). TCP cru com `TCP_NODELAY` faz o papel do WebSocket (o WebSocket só acrescenta o cabeçalho do frame); UDP cru faz o papel dos datagramas do WebTransport (QUIC acrescenta cifra e controle de congestionamento, não retransmite datagrama).

| Perda | Quadros TCP p95 / p99 / máx | Quadros UDP p95 / p99 / máx | Quadros > 200 ms (TCP / UDP) | Comandos TCP p95 / máx | Comandos UDP p95 / máx |
|---|---|---|---|---|---|
| 0% | 44 / 44 / 44 | 44 / 45 / 45 | 0 / 0 | 44 / 74 | 44 / 45 |
| 1% | 44 / 222 / 229 | 44 / 141 / 144 | 7 / 0 | 71 / 486 | 44 / 94 |
| 2% | 96 / 223 / 227 | 44 / 141 / 144 | 8 / 0 | 81 / 211 | 44 / 95 |
| 3% | 122 / 229 / 422 | 44 / 143 / 145 | 17 / 0 | 122 / 268 | 44 / 142 |

Em 45 s, tempos em ms. Sem perda, os dois são iguais. Com perda, o TCP segura tudo o que vem atrás do pacote perdido até a retransmissão (~1 RTT + espera do TCP): aparecem as "travadinhas" de 200 a 400 ms. Nos datagramas, o quadro perdido é substituído pelo seguinte (100 ms depois) e o comando perdido chega repetido no datagrama seguinte (50 ms): o p95 não sai de 44 ms e nada passa de 145 ms.

O laboratório perde pacotes de forma independente; Wi-Fi e 4G perdem em rajadas, o que piora o TCP (várias retransmissões em fila) mais do que os datagramas.

## Viabilidade

- **Navegadores:** WebTransport é Baseline desde março de 2026 (Chrome/Edge 97+, Firefox 114+, Safari 26.4+). O cliente desktop (Electron 44) já tem. Navegador antigo continua no WebSocket.
- **Servidor:** `@fails-components/webtransport` 1.6.11 (BSD-3, compatível com a GPL; ativa, atualizada em out/2026), HTTP/3 pela quiche, com binário nativo. O game server mantém o WebSocket (uWebSockets.js) como reserva e abre o WebTransport ao lado, numa porta UDP.
- **Infra do beta:** o Caddy não repassa WebTransport, então o game server atende direto: porta UDP liberada na lista de segurança da Oracle e no firewall da VM, e o certificado do Caddy (Let's Encrypt, volume `caddy-data`) lido pelo game server, com recarga na renovação.
- **Protocolo:** as mensagens já são binárias e com sequência. Quadros e comandos vão por datagrama (até ~1200 bytes por datagrama; quadro maior vai pelo stream confiável); chat, entrada, fim de partida e o resto continuam num stream confiável do mesmo WebTransport.

## Custo de operação

- Uma porta UDP a mais e o certificado compartilhado; nenhum serviço pago. Memória e CPU parecidas com o WebSocket (QUIC cifra no espaço do usuário: um pouco mais de CPU por jogador, irrelevante a 10 Hz).
- Imagem do game server com o binário nativo da quiche para a arquitetura da VM (x64 hoje, ARM se migrar para a A1).
- Duas rotas de transporte para manter e testar (WebTransport e a reserva WebSocket).

## Recomendação

Vale implementar: é o que mais tira "travadinha" de quem joga em Wi-Fi ou 4G, sem mudar a física (D-74). Em dois cards:

- **OG-405** (5 pts): WebTransport no game server (datagramas para quadros e comandos, stream para o resto), certificado do Caddy, porta UDP no beta, métricas de perda por transporte.
- **OG-406** (3 pts): cliente escolhe WebTransport quando há suporte e cai no WebSocket sem o jogador perceber; telemetria (OG-369) mostra o transporte e a perda; opção de forçar WebSocket.
