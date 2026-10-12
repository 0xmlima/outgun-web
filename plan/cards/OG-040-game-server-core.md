# OG-040 — Núcleo do game server (salas, loop 10 Hz)

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S5 |
| Status | Backlog |
| Dependências | [OG-029](OG-029-match-lifecycle.md) |
| Regras de negócio | RN-TIM-04 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero entrar numa sala online e jogar com outras pessoas em tempo real.

## Contexto e referências no original
- `Server::loop` (`server.cpp:1868`).
- Seção 5.3 do PLAN (modelo de rede).

## Escopo
- `apps/game-server` com uWebSockets.js, várias salas por processo.
- Loop de 10 Hz com compensação de drift (timer de alta resolução).
- Ciclo de vida da sala: criação a partir de preset + rotação de mapas, entrada/saída, encerramento quando vazia.
- Healthcheck e métricas básicas.

## Critérios de aceite
- [ ] Duas abas do navegador conectam e veem o mesmo estado.
- [ ] Tick estável em 100 ms ± 2 ms com 32 conexões simuladas.
- [ ] Sala vazia é encerrada após timeout configurável.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
