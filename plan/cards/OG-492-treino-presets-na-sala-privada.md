# OG-492 — Treino: presets de treino na criação da sala privada

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S55 |
| Status | Em revisão |
| Dependências | OG-490 |
| Regras de negócio | RN-TRN-01, RN-TRN-05, RN-TRN-06, D-86, D-87 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero escolher um treino na tela de criar sala privada, para começar a treinar sem configurar nada à mão.

## Contexto
- Pedido do PO (2026-10-28): presets de treino na sala privada Casual. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TZn2Kuj8ZwDVQfoB5G8Rbn, cópia em `plan/specs/modos-de-treino/proposta.html`); respostas na D-86.

## Escopo
- Grupo "Treino" na lista de presets de "Criar sala privada" (`apps/web/src/screens/lobby.tsx`): Ataque, Defesa, Fuga e Captura, com as opções do modo (quantidades de bots de cada papel), o nível (1 a 5, ou progressivo, OG-499) e power-ups (desligados por padrão).
- Mapas (D-87, RN-TRN-06): lista fixa de treino, a mesma nos quatro modos e independente da rotação Casual: **2 versus 2 (Duel)**, **3x3 (Duel)**, **Cebs Park**, **Pari2** e **The Cover 4**. Com preset de treino, só esses aparecem e quem cria a sala escolhe qualquer um deles, em qualquer modo; a lista fica numa constante compartilhada entre cliente e API, e a API recusa outro mapa.
- API: a criação valida o modo e as opções; uma sala de treino aberta por conta (a anterior fecha ou a criação é recusada com a mensagem).
- Lobby: sala de treino aparece como "Treino · <modo>" e conta como privada.

## Critérios de aceite
- [x] Criar cada um dos quatro treinos pelo cliente, com as opções indo para a sala.
- [x] Só os cinco mapas de treino na lista; a API recusa outro mapa.
- [x] Segunda sala de treino da mesma conta tratada conforme RN-TRN-06.

## Notas de implementação
- Opções compartilhadas em `packages/settings/src/training.ts` (modos, limites, `TRAINING_MAPS`, 16 vagas). Migração 0047 (`rooms.training` jsonb); spawn → servidor ignora a rotação do painel e o `casualBots` na sala de treino.
- "Criar sala privada": o grupo Treino entra no fim da lista de Regras ("Treino · Ataque"...); com ele, escolhe-se um dos cinco mapas (com miniatura), a quantidade do outro lado, aliados (Defesa), nível 1–5 ou progressivo, power-ups e "mesmo início".
- RN-TRN-06: a sala de treino fora do ar é apagada ao criar outra; com uma no ar, a API recusa (409) e o cliente avisa. Teste em `apps/api/src/routes/training-rooms.test.ts`.
