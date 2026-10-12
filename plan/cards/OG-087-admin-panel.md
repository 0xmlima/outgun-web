# OG-087 — Painel admin

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S11 |
| Status | Backlog |
| Dependências | [OG-086](OG-086-room-registry.md), [OG-046](OG-046-chat-moderation.md) |
| Regras de negócio | RN-CHT-03, RN-CHT-04, RN-PLT-05 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero gerenciar salas, presets, jogadores e punições pelo navegador.

## Contexto e referências no original
- Admin shell e `srvmonit` do original (`servnet.cpp:2771-2990`, `src/tools/srvmonit.cpp`), `doc/admin.html`, `doc/srvmonit.html`.

## Escopo
- Lista de salas ao vivo com jogadores; kick/ban/mute; mensagens do servidor.
- CRUD de presets Casual; o preset Ranked só muda por decisão do PO (versionado, com auditoria). Gestão das rotações de mapas Casual e Ranked.
- Log de auditoria; papéis (admin, moderador).

## Critérios de aceite
- [ ] Toda ação gera registro de auditoria.
- [ ] Acesso restrito por papel com testes.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
