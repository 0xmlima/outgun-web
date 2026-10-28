# OG-499 — Treino: dificuldade que sobe sozinha

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-490, OG-491 |
| Regras de negócio | RN-TRN-07, D-86 |
| Skills | `outgun-card-workflow` |

## História
Como jogador que não sabe qual nível escolher, quero que os bots fiquem mais fortes quando eu acerto e mais fracos quando eu erro.

## Contexto
- Pedido do PO (2026-10-28): presets de treino na sala privada Casual. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TZn2Kuj8ZwDVQfoB5G8Rbn, cópia em `plan/specs/modos-de-treino/proposta.html`); respostas na D-86.
- P10: escolhida entre as "Mais ideias".

## Escopo
- Opção "Progressivo" no nível dos bots: começa no 3; 3 sucessos seguidos sobem um nível (até 5); 3 falhas seguidas descem um (até 1).
- A troca de nível aparece junto do resultado da tentativa ("Bots agora no nível 4").

## Critérios de aceite
- [ ] Teste da regra de subida e descida, nos limites 1 e 5.

## Notas de implementação
