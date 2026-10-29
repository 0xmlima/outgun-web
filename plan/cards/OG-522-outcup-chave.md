# OG-522 — OutCup: chave mata-mata com cabeças de chave e byes

| Campo | Valor |
|---|---|
| Épico | E15 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S56 |
| Status | Concluído |
| Dependências | OG-521 |
| Regras de negócio | RN-CUP-06, RN-CUP-07, D-88 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero uma chave justa, em que as duplas mais fortes não se cruzem logo de cara.

## Contexto
- Proposta 2x2 + OutCup (2026-10-29): artifact https://claude.ai/artifact/CUCHmHonx7Ss4NfXqUv5xf, cópia em `plan/specs/copa-2x2/proposta.html`; respostas do PO com a comunidade na D-88.
- P7: mata-mata simples, md3; final md5.

## Escopo
- Cabeças de chave pela soma do rating exibido dos dois; número que não é potência de 2 → as mais fortes passam direto (bye).
- Avanço automático pelo resultado da série; W.O. duplo elimina as duas e o adversário da fase seguinte avança direto (RN-CUP-10).

## Critérios de aceite
- [x] Chaves de 4, 5, 12 e 32 duplas com byes nas cabeças e cruzamento padrão (teste).

## Notas técnicas
- —

## Notas de implementação
- Chave gravada inteira no sorteio; `settleNext` leva vencedores adiante, resolve byes e W.O. duplo (o adversário seguinte avança direto, sem campeão se a final tiver W.O. duplo).
