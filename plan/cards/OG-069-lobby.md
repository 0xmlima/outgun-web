# OG-069 — Lobby de salas

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S9 |
| Status | Backlog |
| Dependências | [OG-086](OG-086-room-registry.md) |
| Regras de negócio | RN-CFG-03, RN-PLT-02 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver salas abertas (jogadores, mapa, ping, ranqueada ou não) e entrar ou criar uma sala privada.

## Contexto e referências no original
- `Menu_serverList` (`client_menus.h:137`), master server (`servnet.cpp:2481-2580`).

## Escopo
- Abas/filtro por modo (**Casual** e **Ranked**); Ranked pede login antes de entrar.
- Lista de salas com filtros, ping por região, botão "Jogar agora" (matchmaking simples) por modo.
- Criar sala privada Casual (preset, senha, mapas); não existe sala privada Ranked.
- Link de convite.

## Critérios de aceite
- [ ] Lista atualiza em tempo real (≤ 5 s).
- [ ] Convidado entra em sala não ranqueada em ≤ 3 cliques.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
