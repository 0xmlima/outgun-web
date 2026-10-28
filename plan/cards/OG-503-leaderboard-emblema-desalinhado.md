# OG-503 — Visão geral do leaderboard desalinhada com o emblema do clã

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S53 |
| Status | Concluído |
| Dependências | OG-484 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver os 3 primeiros de cada stat alinhados na visão geral do leaderboard, mesmo quando eles têm emblema de clã.

## Contexto
- Achado do PO (2026-10-28) antes de subir a S53: na visão geral (só nela), o emblema do clã virou um item a mais na linha de 3 colunas (posição, nome, valor) e o valor caía para a linha de baixo.

## Escopo
- Emblema e nome numa célula só; nome longo corta com reticências; quadros um pouco mais largos (mínimo de 18rem).

## Critérios de aceite
- [x] Posição, emblema + nome e valor na mesma linha, no "Melhor do mês" e em cada stat.

## Notas de implementação
- `.leaderboard-name` (flex) junta o `ClanBadge` e o link; coluna do nome em `minmax(0, 1fr)` para as reticências funcionarem.
