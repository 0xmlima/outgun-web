# OG-492 — Treino: presets de treino na criação da sala privada

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-490 |
| Regras de negócio | RN-TRN-01, RN-TRN-05, RN-TRN-06, D-69, D-86 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero escolher um treino na tela de criar sala privada, para começar a treinar sem configurar nada à mão.

## Contexto
- Pedido do PO (2026-10-28): presets de treino na sala privada Casual. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TZn2Kuj8ZwDVQfoB5G8Rbn, cópia em `plan/specs/modos-de-treino/proposta.html`); respostas na D-86.

## Escopo
- Grupo "Treino" na lista de presets de "Criar sala privada" (`apps/web/src/screens/lobby.tsx`): Ataque, Defesa, Fuga e Captura, com as opções do modo (quantidades de bots de cada papel), o nível (1 a 5, ou progressivo, OG-499) e power-ups (desligados por padrão).
- Mapas: só os da rotação Casual (D-69) que têm bandeira dos dois times; os outros somem da lista com o preset de treino.
- API: a criação valida o modo e as opções; uma sala de treino aberta por conta (a anterior fecha ou a criação é recusada com a mensagem).
- Lobby: sala de treino aparece como "Treino · <modo>" e conta como privada.

## Critérios de aceite
- [ ] Criar cada um dos quatro treinos pelo cliente, com as opções indo para a sala.
- [ ] Segunda sala de treino da mesma conta tratada conforme RN-TRN-06.

## Notas de implementação
