# OG-083 — Ticket de entrada no game server

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S8 |
| Status | Backlog |
| Dependências | [OG-081](OG-081-auth.md), [OG-040](OG-040-game-server-core.md) |
| Regras de negócio | RN-RNK-01, RN-PLT-02 |
| Skills | `outgun-card-workflow` |

## História
Como sistema, quero que o game server confie na identidade do jogador sem consultar o banco a cada conexão.

## Contexto e referências no original
- Seção 5.4 do PLAN.
- Original: senha de servidor e de jogador no handshake (`servnet.cpp:3341-3365`).

## Escopo
- `POST /rooms/:id/join` → JWT (60 s) assinado com chave rotacionável; contém userId/guestId, nick, flags (ranqueado, admin).
- Validação no game server; senha de sala privada; bans.

## Critérios de aceite
- [ ] Ticket expirado/adulterado é rejeitado.
- [ ] Convidado só entra em salas Casual; o ticket informa se o jogador tem conta (requisito do Ranked, RN-MOD-03).

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
