# OG-431 — Retorno do relato ao jogador

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S46 |
| Status | Em andamento |
| Dependências | OG-430 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador que relatou um bug, quero ver em que pé ele está e em que versão foi corrigido, para saber que fui ouvido.

## Escopo
- "Seus relatos" na tela de feedback: data, resumo, situação (recebido, confirmado, na fila de correção, corrigido, descartado) e o link da issue quando houver.
- Situação da issue lida do GitHub (aberta/fechada e o milestone com a versão, ex. `2.46.0`), com cache de alguns minutos; issue fechada como concluída marca o relato como corrigido "na 2.46.0".

## Critérios de aceite
- [ ] O jogador vê só os próprios relatos (teste).
- [ ] Issue fechada com milestone `2.46.0` aparece como "Corrigido na 2.46.0" (teste com GitHub simulado).

## Notas técnicas
- O fechamento das issues com o milestone é feito pelo script do OG-432 na aprovação da sprint.

## Notas de implementação
(preenchido durante a execução)
