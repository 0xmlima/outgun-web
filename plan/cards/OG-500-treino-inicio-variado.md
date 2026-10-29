# OG-500 — Treino: início variado a cada tentativa

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S55 |
| Status | Em revisão |
| Dependências | OG-493, OG-494, OG-495, OG-496 |
| Regras de negócio | RN-TRN-07, D-86 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que cada tentativa comece de um jeito um pouco diferente, para não decorar uma jogada só.

## Contexto
- Pedido do PO (2026-10-28): presets de treino na sala privada Casual. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TZn2Kuj8ZwDVQfoB5G8Rbn, cópia em `plan/specs/modos-de-treino/proposta.html`); respostas na D-86.
- P10: escolhida entre as "Mais ideias".

## Escopo
- Por tentativa, sortear dentro do modo: qual base (em mapas com mais de uma bandeira por time), o ponto de nascimento dos humanos e dos bots e a porta de entrada/saída.
- Opção na sala para desligar ("mesmo início"), para treinar uma jogada específica. Padrão: variado.
- Sorteio no servidor com o `Rng` da sala (nada de `Math.random` no sim).

## Critérios de aceite
- [x] Tentativas seguidas começam de posições diferentes; com "mesmo início", iguais.

## Notas de implementação
- O sorteio é do juiz (`GlibcRand` da sala, nada de `Math.random`); "mesmo início" recomeça o sorteio igual a cada tentativa. Varia: sala de entrada no Ataque (vizinha da base inimiga), direção da onda na Defesa (sala a 2 da base), sala dos perseguidores na Fuga, sala de saída e escolta na Captura, e os pontos de todos.
- "Qual base": os cinco mapas de treino têm uma bandeira por time, então não há o que sortear; fica pronto para mapas com mais de uma se a lista crescer.
