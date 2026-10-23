# OG-376 — Transporte por datagramas (WebTransport) para conexões com perda

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Spike |
| Prioridade | Could |
| Estimativa | 8 pts |
| Sprint | S42 |
| Status | Concluído |
| Dependências | OG-370 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador com Wi-Fi ou conexão instável, quero que um pacote perdido não congele os seguintes, para não sentir "travadinhas" de 200 ms.

## Contexto
- O jogo usa WebSocket (TCP): um pacote perdido segura todos os que vêm atrás até a retransmissão (bloqueio de cabeça de fila). O original usava UDP. Risco R4 do PLAN já previa WebTransport na v2.
- Com inputs por sequência (OG-370), o servidor tolera perda e reordenação: pré-requisito resolvido.

## Escopo
- Avaliar WebTransport (HTTP/3, datagramas) no Chromium/Electron e no Node do game server (biblioteca, TLS no Caddy da VM), com WebSocket como reserva.
- Medir com perda simulada (1–3%) o atraso p95 dos frames e dos inputs.

## Critérios de aceite
- [x] Relatório com viabilidade, custo de operação e ganho medido; card de implementação se valer.

## Notas de implementação
- Relatório em `plan/reports/OG-376-webtransport.md`: com 3% de perda, quadros p95 122 ms (TCP) contra 44 ms (datagramas), máximo 422 contra 145, 17 quadros acima de 200 ms em 45 s contra 0. Vale implementar: OG-405 (servidor e infra) e OG-406 (cliente com reserva em WebSocket), no Backlog.
(preenchido durante a execução)
