# OG-215 — Diretório e busca de jogadores

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S15 |
| Status | Concluído |
| Dependências | [OG-200](OG-200-design-system-v2.md), [OG-211](OG-211-api-social.md) |
| Regras de negócio | RN-SOC-04 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero buscar outros jogadores por nome ou clã e ver quem está mais ativo, para encontrar companheiros.

## Contexto
- —

## Escopo
- Página `/jogadores` com busca, mais ativos da semana e clãs.
- Ranking da temporada no novo visual (substitui a `LeaderboardScreen`).

## Critérios de aceite
- [x] Busca indiferente a acentos/maiúsculas; prints.

## Notas técnicas
- —

## Notas de implementação
- `/players` (`screens/Players.tsx`; `/jogadores` redireciona): busca enquanto digita (nome por `usernameKey`, clã com `translate` sem acentos), mais ativos em 7 dias e clãs via `GET /directory` (cache de 30 s; quem esconde o histórico fica fora). `/ranking` no visual v2 no mesmo arquivo.
