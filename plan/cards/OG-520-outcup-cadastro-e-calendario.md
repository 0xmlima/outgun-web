# OG-520 — OutCup: cadastro, calendário mensal e painel admin

| Campo | Valor |
|---|---|
| Épico | E15 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S56 |
| Status | Backlog |
| Dependências | OG-516 |
| Regras de negócio | RN-CUP-01, RN-CUP-02, RN-CUP-03, D-88 |
| Skills | `outgun-card-workflow` |

## História
Como comunidade, quero uma OutCup aberta todo mês, com datas fixas, sem depender de alguém criar à mão.

## Contexto
- Proposta 2x2 + OutCup (2026-10-29): artifact https://claude.ai/artifact/CUCHmHonx7Ss4NfXqUv5xf, cópia em `plan/specs/copa-2x2/proposta.html`; respostas do PO com a comunidade na D-88.
- P15: o nome oficial é **OutCup** (edição = "OutCup · Dezembro 2026"). P8: cada fase numa semana; a copa nunca passa do mês e a final termina até o último dia.

## Escopo
- Tabelas da copa (edição, inscritos, duplas, confrontos, horários) em migração nova.
- Criação automática: a edição do mês seguinte abre inscrições no dia 20 (Brasília); fecha e sorteia no último dia do mês às 20h.
- Calendário das fases (RN-CUP-03): até 4 fases, uma por semana a partir do dia 1 (a última vai até o fim do mês); 5 ou mais, o mês é dividido em janelas iguais. Final sempre termina no último dia, 23:59.
- Painel admin: ver, abrir fora de época, cancelar e editar datas, com auditoria.

## Critérios de aceite
- [ ] Virada simulada de mês abre a edição seguinte e o calendário bate com RN-CUP-03 para 4, 8, 16 e 32 duplas (teste).

## Notas técnicas
- Interpretação a confirmar: datas de inscrição (dia 20 ao último dia do mês anterior) e sorteio às 20h.

## Notas de implementação
