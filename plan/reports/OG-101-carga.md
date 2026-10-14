# OG-101 — Relatório de carga do game server

Gerado por `node tools/load/run.mjs` (S11, 2026-10-14). Máquina: MacBook Pro com Intel Core i9-9980HK
(2019), Node 24 x64. Um processo de game server com 20 salas fixas do preset Clássico no mapa
`outgun1`; 640 clientes headless em 4 processos separados entram com ticket `dev:`, respondem às
trocas de mapa e mandam controles a 10 Hz (mudam de direção ~1×/s e atiram às vezes). Métricas tiradas
do `/metrics` do próprio servidor (OG-102), descontando o aquecimento.

## Conclusão

- Todos os RNF da seção 7 atendidos com 20 salas cheias em **um** núcleo: tick de sala p95 < 1 ms
  (meta < 5 ms), ~21–25% de um núcleo, 1,3 KB/s por cliente (meta < 10 KB/s), nenhum tick
  descartado, nenhum cliente recusado ou derrubado, 10 frames/s em todos os clientes.
- Com RTT 150 ms, jitter 20 ms e 2% de perda (com retransmissão, como TCP) o servidor não muda: a
  rede ruim só aumenta o maior intervalo entre frames visto pelo cliente (285 ms), que a
  interpolação do cliente (OG-064) absorve.
- O tick do processo cresce com o número de salas (≈ 0,75 ms por sala cheia): 20 salas dão p95 de
  15–16 ms, perto do alerta de 20 ms do OG-102. Na operação (OG-103), cada processo deve hospedar
  até ~20 salas cheias (`MAX_ROOMS`) e escalar com mais processos/vCPUs; o alerta indica a hora de
  abrir outro.

## Rede limpa

- Data: 2026-10-14T05:41:52.507Z; máquina: darwin x64, Node v24.14.0
- Mapa: outgun1; preset Clássico; 640 de 640 jogadores na partida no fim (recusas: {}; quedas: 0)
- Rede simulada nos clientes: RTT 0 ms, jitter 0 ms, perda 0%
- Medição: 60 s depois de 20 s de aquecimento; 601 ticks

| Medida | Valor | RNF | |
|---|---|---|---|
| Tick de uma sala (simulação + serialização), p50 / p95 / p99 | 0.75 ms / 0.98 ms / 1.28 ms | p95 < 5 ms com 32 jogadores | ✅ |
| Ticks de sala até 5 ms | 100.0% | | |
| Tick do processo (todas as salas), p50 / p95 / p99 | 12.61 ms / 14.96 ms / 19.52 ms | < 100 ms (10 Hz); alerta em p95 > 20 ms | ✅ |
| Atraso do tick p99 / ticks descartados | 1.00 ms / 0 | 0 descartados | ✅ |
| CPU do game server | 21% de 1 núcleo | ≥ 20 salas cheias por vCPU | ✅ |
| Tráfego servidor → cliente (medido no servidor / nos clientes) | 1.30 KB/s / 1.31 KB/s | < 10 KB/s por cliente | ✅ |
| Tráfego cliente → servidor | 0.05 KB/s | | |
| Frames recebidos por cliente / maior intervalo entre frames | 9.99/s / 118 ms | 10/s | ✅ |

## Rede ruim (RTT 150 ms, jitter 20 ms, perda 2%)

- Data: 2026-10-14T05:43:17.815Z; máquina: darwin x64, Node v24.14.0
- Mapa: outgun1; preset Clássico; 640 de 640 jogadores na partida no fim (recusas: {}; quedas: 0)
- Rede simulada nos clientes: RTT 150 ms, jitter 20 ms, perda 2%
- Medição: 60 s depois de 20 s de aquecimento; 601 ticks

| Medida | Valor | RNF | |
|---|---|---|---|
| Tick de uma sala (simulação + serialização), p50 / p95 / p99 | 0.75 ms / 0.98 ms / 1.41 ms | p95 < 5 ms com 32 jogadores | ✅ |
| Ticks de sala até 5 ms | 100.0% | | |
| Tick do processo (todas as salas), p50 / p95 / p99 | 12.67 ms / 16.17 ms / 19.70 ms | < 100 ms (10 Hz); alerta em p95 > 20 ms | ✅ |
| Atraso do tick p99 / ticks descartados | 1.92 ms / 0 | 0 descartados | ✅ |
| CPU do game server | 25% de 1 núcleo | ≥ 20 salas cheias por vCPU | ✅ |
| Tráfego servidor → cliente (medido no servidor / nos clientes) | 1.31 KB/s / 1.32 KB/s | < 10 KB/s por cliente | ✅ |
| Tráfego cliente → servidor | 0.05 KB/s | | |
| Frames recebidos por cliente / maior intervalo entre frames | 9.99/s / 285 ms | 10/s | ✅ |
