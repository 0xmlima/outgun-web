# OG-086 — Registro de salas e matchmaking

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S9 |
| Status | Backlog |
| Dependências | [OG-080](OG-080-api-db.md), [OG-040](OG-040-game-server-core.md) |
| Regras de negócio | RN-CFG-03 |
| Skills | `outgun-card-workflow` |

## História
Como plataforma, quero saber quais salas existem e onde, para listar no lobby e alocar jogadores.

## Contexto e referências no original
- Master server do original (`servnet.cpp:2481-2580`, `config/master.txt`).

## Escopo
- Game servers registram salas e heartbeat no Redis (modo, jogadores, mapa, preset, região).
- Salas Ranked são criadas pela plataforma com o preset Ranked; "Jogar agora" funciona por modo.
- API cria salas sob demanda no servidor menos carregado.
- "Jogar agora": sala pública com vagas mais próxima do ping do jogador.

## Critérios de aceite
- [ ] Sala some do lobby em ≤ 10 s após o servidor cair.
- [ ] Criação de sala privada responde em < 1 s.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
