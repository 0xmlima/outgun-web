# OG-376 — Transporte por datagramas (WebTransport) para conexões com perda

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Spike |
| Prioridade | Could |
| Estimativa | 8 pts |
| Sprint | — |
| Status | Backlog |
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
- [ ] Relatório com viabilidade, custo de operação e ganho medido; card de implementação se valer.

## Notas de implementação
(preenchido durante a execução)
