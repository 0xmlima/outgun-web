# OG-454 — Métricas de quedas no game server: conexões fechadas e salas encerradas

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S48 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero saber quando muitos jogadores caem de uma vez e por quê (o cliente saiu, a rede caiu, a sala foi encerrada), para separar travamento do servidor de problema de rede.

## Escopo
- `outgun_ws_closed_total{kind, code}`: WebSockets fechados por tipo (jogador, espectador) e código de fechamento (1000 saída normal, 1001 sala encerrada, 1006 queda sem aviso, 4xxx do jogo; o resto vira `other`).
- `outgun_rooms_closed_total{reason}`: salas encerradas por motivo (`finished`, `empty`, `shutdown`), com uma linha de log por sala encerrada.
- Alerta: muitos jogadores caindo sem aviso no mesmo minuto (regra no OG-455).

## Critérios de aceite
- [x] As duas métricas aparecem no `/metrics` com cardinalidade fixa.
- [x] Teste cobre os códigos e os motivos.

## Notas de implementação
- Códigos com rótulo próprio: 1000, 1001, 1003, 1005, 1006, 1011 e 4000–4003; o resto vira `other`. `RoomManager.close` recebe o motivo (padrão `shutdown`) e avisa o `TickObserver.roomClosed`; o log "sala encerrada" leva sala e motivo e vai ao Loki pelo OG-452.
