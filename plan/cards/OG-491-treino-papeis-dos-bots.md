# OG-491 — Treino: papéis fixos dos bots (guardar base, atacar, perseguir, levar e escoltar a bandeira)

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-490 |
| Regras de negócio | RN-TRN-03, D-86 |
| Skills | `outgun-card-workflow` |

## História
Como jogador treinando, quero que cada bot cumpra o papel do modo, para a situação de treino se repetir de verdade.

## Contexto
- Pedido do PO (2026-10-28): presets de treino na sala privada Casual. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TZn2Kuj8ZwDVQfoB5G8Rbn, cópia em `plan/specs/modos-de-treino/proposta.html`); respostas na D-86.
- Hoje a IA (`packages/bots/src/brain.ts`, `ChooseDestination`) escolhe o destino sozinha pela situação das bandeiras: não existe papel fixo, e um "defensor" pode sair para atacar.

## Escopo
- Papel opcional por bot, só nas salas de treino: **guardar a base** (fica na sala da base e caça quem entra), **atacar a bandeira** (vai à bandeira e tenta sair da sala da base com ela), **perseguir o portador**, **levar a bandeira para casa** (portador) e **escoltar o portador**.
- Sem papel, o bot continua exatamente como hoje (Casual, Ranked e bots substitutos não mudam). Nível 1 a 5 (OG-266) vale para todos os papéis.
- Na Defesa, os atacantes saem juntos (RN-TRN-04).

## Critérios de aceite
- [ ] Testes por papel com mapas de fixture (o guardião não sai da sala da base; o perseguidor segue o portador entre salas; o portador vai à base).
- [ ] Testes existentes dos bots sem papel continuam passando sem regravar.

## Notas técnicas
- O papel troca o `ChooseDestination` (destino); mira, combate e navegação continuam os mesmos.

## Notas de implementação
