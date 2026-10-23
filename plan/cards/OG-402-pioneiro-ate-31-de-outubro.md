# OG-402 — Pioneiro para quem jogar até 31 de outubro

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S41 (2.41.2) |
| Status | Concluído |
| Dependências | OG-390 |
| Regras de negócio | RN-SOC-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador do beta, quero o marco "Pioneiro" com a data da minha primeira partida, para ficar registrado que joguei desde o começo.

## Contexto
- Pedido do PO em 2026-10-23. O marco `beta` dependia de `BETA=1` no servidor, desligado desde 2026-10-16: ninguém o recebia.

## Escopo
- `PIONEER_UNTIL` em `packages/content/src/milestones.ts` (2026-11-01 00:00 de São Paulo): a primeira partida terminada antes dela dá o Pioneiro, com a data e a partida dela. `BETA=1` continua dando em qualquer data.
- Retroativo no beta (`node dist/cli.js milestones`) para quem já jogou; quem jogar até 31/10 recebe ao fim da partida. Conta sem partidas não tem data, então recebe quando jogar a primeira (até 31/10).

## Critérios de aceite
- [x] Toda conta com partida até 31/10 tem o Pioneiro na data da primeira partida.
- [x] Partida depois de 31/10 não dá o marco (teste).

## Notas de implementação
- Para estender o prazo: mudar `PIONEER_UNTIL`, deploy e retroativo. Na Steam, a conquista BETA sai na próxima vez que o jogador entrar pelo app.
