# OG-282 — "Agora no Outgun" conta bots como jogadores online

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Correção |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S21 |
| Status | Backlog |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que "jogadores online" na tela inicial mostre só pessoas, para saber quantos humanos estão jogando de verdade.

## Contexto
- Achado do PO no beta (2026-10-15): uma sala com 1 jogador e 7 bots aparece como "8 jogadores online".
- `liveRooms` (`apps/web/src/screens/home-panels.tsx:43`) soma `players` das salas, que inclui bots (`room.playerCount`). O roster que o game server manda no heartbeat já tem `bot` por jogador e fica gravado em `rooms.roster`, então não precisa mudar o heartbeat nem o banco.

## Escopo
- API: `humans` no resumo da sala (`apps/api/src/routes/rooms.ts`, contado no roster: `!bot`); regerar o `openapi.json`.
- Tela inicial: "jogadores online" = soma de `humans`; "Salas com gente" só lista sala com humano e ordena por humanos.
- A coluna `8/16` continua contando bots (dá a ideia de sala cheia), na tela inicial e no lobby.

## Critérios de aceite
- [ ] Sala com 1 humano e 7 bots: "1 jogador online" e a sala listada como `8/16`.
- [ ] Sala só com bots não aparece em "Salas com gente" nem soma no total.
- [ ] Testes de `liveRooms` e da rota de salas atualizados.

## Notas de implementação
(preenchido durante a execução)
