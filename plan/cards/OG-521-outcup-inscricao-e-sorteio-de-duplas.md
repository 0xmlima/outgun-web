# OG-521 — OutCup: inscrição individual e sorteio das duplas

| Campo | Valor |
|---|---|
| Épico | E15 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S56 |
| Status | Concluído |
| Dependências | OG-520 |
| Regras de negócio | RN-CUP-04, RN-CUP-05, D-88 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero me inscrever sozinho e receber uma dupla sorteada, para a copa ser dinâmica e ninguém ficar de fora por não ter parceiro.

## Contexto
- Proposta 2x2 + OutCup (2026-10-29): artifact https://claude.ai/artifact/CUCHmHonx7Ss4NfXqUv5xf, cópia em `plan/specs/copa-2x2/proposta.html`; respostas do PO com a comunidade na D-88.
- P5: nas primeiras edições as duplas são sorteadas pelo jogo. P6: livre para todos (com conta, pois são ranqueadas). P14: mínimo de 4 duplas.

## Escopo
- Botão "Inscrever-me" e "Sair" até o fechamento; lista de inscritos pública.
- No fechamento: menos de 8 inscritos → edição cancelada e todos avisados. Senão, duplas sorteadas ao acaso (sem balancear), com o RNG registrado para auditoria.
- Número ímpar: o último a se inscrever fica de fora e é avisado.
- Banido de plataforma não se inscreve.

## Critérios de aceite
- [x] Sorteio com 9 inscritos forma 4 duplas e deixa de fora o último (teste).
- [x] 7 inscritos cancelam a edição (teste).

## Notas técnicas
- Interpretação a confirmar: quem fica de fora com número ímpar (último inscrito).

## Notas de implementação
- Sorteio com semente gravada (`draw_seed`, mulberry32 + Fisher–Yates), cabeças pela soma do rating exibido; ímpar deixa de fora o último inscrito (interpretação a confirmar). Abaixo de 8 inscritos a edição é cancelada no fechamento. Exclusão de conta troca o nome na dupla por "(anon)".
