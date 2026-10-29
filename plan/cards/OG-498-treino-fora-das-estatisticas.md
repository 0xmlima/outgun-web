# OG-498 — Treino não conta para nada: estatísticas, ranking, radar, relatórios e marcos

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S55 |
| Status | Concluído |
| Dependências | OG-490 |
| Regras de negócio | RN-TRN-01, D-86 |
| Skills | `outgun-card-workflow` |

## História
Como comunidade, queremos que o treino não gere números, para ninguém inflar estatística treinando contra bot.

## Contexto
- Pedido do PO (2026-10-28): presets de treino na sala privada Casual. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TZn2Kuj8ZwDVQfoB5G8Rbn, cópia em `plan/specs/modos-de-treino/proposta.html`); respostas na D-86.
- P9: treino não contabiliza para nada.

## Escopo
- Sala de treino não grava partida (`matches`/`match_players`), não alimenta estatísticas, leaderboard, rating, radar (D-84), relatórios, marcos (inclusive o de pioneiro), "Melhor do mês" nem companheiros.
- Sem replay gravado. "Agora no Outgun" pode contar o jogador como online, mas a sala aparece como treino.

## Critérios de aceite
- [x] Teste da API/servidor: uma sessão de treino não cria linha em nenhuma tabela de partida ou estatística.

## Notas de implementação
- A sala de treino não chama `reportMatch` (nada chega à API: partidas, estatísticas, rating, radar, marcos, "Melhor do mês", companheiros), não grava replay (sem espectador ao vivo) e não acumula eventos. Como não há fim de partida, a drenagem do servidor fecha a sala na hora.
- "Agora no Outgun": a sala aparece com o modo de treino no resumo (OG-492).
