# OG-211 — API social: companheiros, rivais, evolução e busca

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S14 |
| Status | Backlog |
| Dependências | [OG-085](OG-085-profile-history.md) |
| Regras de negócio | RN-SOC-02, RN-SOC-03, RN-SOC-04 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero descobrir com quem mais jogo, contra quem, e como evoluí, para conhecer melhor a comunidade.

## Contexto
- `apps/api/src/routes/players.ts`; tabelas `match_players` (time e usuário por partida), `ratings`, `rating_deltas`, `matches`.

## Escopo
- `GET /players/:nome/social`: companheiros mais frequentes (partidas e vitórias juntos), rivais mais frequentes (partidas contra, saldo), clã.
- `GET /players/:nome/progress`: rating por temporada e série de `rating_deltas`; totais por período (7 dias, 30 dias, sempre).
- `GET /players?busca=`: busca por nome/clã (mesma comparação do login), paginada.
- Índices e limite de custo (consultas agregadas com teto; cache curto).
- Bots e convidados não aparecem como companheiros/rivais.
- Privacidade (D-39): perfil público; na conta, opções "esconder companheiros/rivais" e "esconder histórico de partidas" (migration + rota de conta); escondido, a API não devolve esses dados nem lista o jogador como companheiro de outros.

## Critérios de aceite
- [ ] Testes com Postgres cobrindo companheiros, rivais, evolução e busca.
- [ ] p95 < 50 ms com 100 mil partidas sintéticas (medição no card).
- [ ] Esquema OpenAPI atualizado (`openapi.test.ts`).

## Notas técnicas
- —

## Notas de implementação
(preenchido durante a execução)
