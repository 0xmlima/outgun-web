# OG-496 — Treino Captura: alcançar o portador e devolver a bandeira

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-490, OG-491 |
| Regras de negócio | RN-TRN-04, D-86 |
| Skills | `outgun-card-workflow` |

## História
Como defensor, quero treinar alcançar quem levou a minha bandeira e devolvê-la antes da entrega.

## Contexto
- Pedido do PO (2026-10-28): presets de treino na sala privada Casual. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TZn2Kuj8ZwDVQfoB5G8Rbn, cópia em `plan/specs/modos-de-treino/proposta.html`); respostas na D-86.
- P5: sucesso = devolver a bandeira. P6: "cenários diversos dentro do modo treino".

## Escopo
- Um bot com papel **levar a bandeira para casa** sai da sua base com a sua bandeira; escolta de 0 a 3 bots (papel **escoltar o portador**).
- Cenários variados por tentativa: escolta, vantagem do portador na saída e porta de saída sorteadas dentro dos limites escolhidos na sala (ou fixos, se o jogador fixar).
- Falha: a bandeira é entregue na base inimiga, ou você morre.
- Sucesso: a bandeira volta (derrubar o portador e tocar nela).

## Critérios de aceite
- [ ] As condições de fim funcionam; tentativas seguidas mostram cenários diferentes.

## Notas técnicas
- Interpretação da P6 a confirmar na revisão: "cenários diversos" = escolta e saída do portador variando a cada tentativa. Morrer também reinicia (proposta da página, não contestada).

## Notas de implementação
