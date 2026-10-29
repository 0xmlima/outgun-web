# OG-524 — OutCup: marcar o jogo pelo portal

| Campo | Valor |
|---|---|
| Épico | E15 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S56 |
| Status | Em revisão |
| Dependências | OG-522 |
| Regras de negócio | RN-CUP-08, D-88 |
| Skills | `outgun-card-workflow` |

## História
Como dupla, quero combinar o horário do confronto dentro do jogo, sem depender de grupo externo.

## Contexto
- Proposta 2x2 + OutCup (2026-10-29): artifact https://claude.ai/artifact/CUCHmHonx7Ss4NfXqUv5xf, cópia em `plan/specs/copa-2x2/proposta.html`; respostas do PO com a comunidade na D-88.
- P9: a organização acontece pelo jogo.

## Escopo
- Página do confronto: cada jogador marca horários disponíveis na janela da fase (fuso de Brasília, mostrando também o local).
- Quando há horário em que os 4 podem, qualquer um propõe; a dupla adversária aceita → jogo marcado (pode remarcar se os 4 aceitarem, sempre dentro da janela).
- Disponibilidade marcada fica registrada para a regra do W.O. (RN-CUP-10).

## Critérios de aceite
- [x] Fluxo marcar → propor → aceitar → marcado, e remarcação, com prazo da janela respeitado (teste).

## Notas técnicas
- —

## Notas de implementação
- Grade de horas da janela no fuso de quem vê; proposta só numa hora cheia em que os 4 marcaram (é o aceite dos 4) e a outra dupla aceita ou recusa; remarcar = nova proposta aceita. Proposta vencida é limpa pelo relógio.
