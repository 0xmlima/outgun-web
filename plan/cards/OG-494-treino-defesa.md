# OG-494 — Treino Defesa: segurar a onda de atacantes

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-490, OG-491 |
| Regras de negócio | RN-TRN-02, RN-TRN-04, D-86 |
| Skills | `outgun-card-workflow` |

## História
Como defensor, quero treinar segurar a bandeira contra vários atacantes ao mesmo tempo.

## Contexto
- Pedido do PO (2026-10-28): presets de treino na sala privada Casual. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TZn2Kuj8ZwDVQfoB5G8Rbn, cópia em `plan/specs/modos-de-treino/proposta.html`); respostas na D-86.
- P3: sucesso = derrubar todos os atacantes, que atacam ao mesmo tempo (de preferência).

## Escopo
- Você + 1 ou 2 bots aliados (papel **guardar a base**) na sua base; 1 a 5 atacantes (papel **atacar a bandeira**) saem juntos de fora da sala da base.
- Falha: você morre, ou um atacante sai da sala da base com a sua bandeira.
- Sucesso: todos os atacantes da onda caem. Atacante abatido não renasce dentro da tentativa.

## Critérios de aceite
- [ ] Onda saindo junta; as condições de fim funcionam e reiniciam a tentativa.

## Notas de implementação
