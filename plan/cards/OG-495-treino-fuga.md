# OG-495 — Treino Fuga: da base inimiga até a sua com a bandeira

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S55 |
| Status | Pronto |
| Dependências | OG-490, OG-491 |
| Regras de negócio | RN-TRN-04, D-86, D-87 |
| Skills | `outgun-card-workflow` |

## História
Como portador, quero treinar levar a bandeira para casa com inimigos no meu encalço.

## Contexto
- Pedido do PO (2026-10-28): presets de treino na sala privada Casual. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TZn2Kuj8ZwDVQfoB5G8Rbn, cópia em `plan/specs/modos-de-treino/proposta.html`); respostas na D-86.
- P4: da base inimiga até a sua base.

## Escopo
- Você começa na sala da base inimiga já com a bandeira inimiga; 1 a 4 bots com papel **perseguir o portador**.
- Bots (OG-491): só **perseguir o portador**. Nenhum bot pega bandeira nem vai esperar na sua base.
- Falha: você morre.
- Sucesso: você captura na sua base (com a sua bandeira em casa, regra normal de captura).

## Critérios de aceite
- [ ] As condições de fim funcionam e reiniciam a tentativa.

## Notas de implementação
