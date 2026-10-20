# OG-319 — Espectador também em salas com senha

| Campo | Valor |
|---|---|
| Épico | E6 |
| Tipo | Melhoria |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S30 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como espectador, quero assistir também às partidas em salas com senha, porque os jogos competitivos costumam ser fechados para quem joga, não para quem assiste.

## Contexto
- Decisão do PO em 2026-10-20, revogando a divergência do OG-092 ("salas com senha não são assistíveis", confirmada em 2026-10-14).
- Hoje a API devolve `spectateUrl: null` quando a sala tem senha (`apps/api/src/routes/rooms.ts:58`). O game server não confere senha no WebSocket do espectador (`apps/game-server/src/server.ts:252`).
- A senha continua protegendo a entrada como jogador; o espectador só vê com o atraso do OG-318.

## Escopo
- `spectateUrl` presente para toda sala online com endereço, com ou sem senha.
- Registrar como decisão D-NN e atualizar a nota do OG-092 / `plan/specs/replays.md`.

## Critérios de aceite
- [x] Teste da rota `/rooms` e `/rooms/:id`: sala com senha tem `spectateUrl`.

## Notas técnicas
## Notas de implementação
- `spectateUrl` não depende mais da senha (`rooms.ts`); o WebSocket do espectador já não conferia senha. D-57.
- Teste em `registry.test.ts` (Ranked com senha em jogo); roda com Postgres no fechamento.
