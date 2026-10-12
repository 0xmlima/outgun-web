# OG-047 — Idle kick, desconexão e reconexão

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S8 |
| Status | Backlog |
| Dependências | [OG-040](OG-040-game-server-core.md) |
| Regras de negócio | RN-IDL-01 |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero voltar à partida se minha conexão cair por alguns segundos; como sala, quero remover inativos.

## Contexto e referências no original
- Idle kick (`server.cpp:1640-1660`).
- `client_disconnected` (`servnet.cpp:1525`).

## Escopo
- Aviso e expulsão por inatividade com os limites do original.
- Reconexão em até 15 s mantendo slot, time e estatísticas (novo).

## Critérios de aceite
- [ ] Queda de rede de 10 s não perde frags nem time.
- [ ] Idle kick só ocorre com ≥ `idlekick_playerlimit` humanos.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
