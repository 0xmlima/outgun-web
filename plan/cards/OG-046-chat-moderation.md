# OG-046 — Chat, comandos e moderação

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S8 |
| Status | Backlog |
| Dependências | [OG-040](OG-040-game-server-core.md) |
| Regras de negócio | RN-CHT-01, RN-CHT-02, RN-CHT-03, RN-CHT-04, RN-NOM-03 |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero conversar com todos ou só com meu time; como moderador, quero silenciar, expulsar e banir.

## Contexto e referências no original
- `Server::chat` (`server.cpp:1188-1530`).
- `isFlood`, `check_name` (`commont.cpp:190-215`).
- `doc/admin.html`.

## Escopo
- Chat geral e de time, anti-flood, comandos de jogador e admin, `/set` com permissões, auditoria.
- Filtro de palavrões configurável (novo, opcional por sala).

## Critérios de aceite
- [ ] Anti-flood com os mesmos limiares do original (testes).
- [ ] Ações de admin persistidas com autor, alvo, motivo e duração.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
