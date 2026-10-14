# OG-211 — API social: companheiros, rivais, evolução e busca

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S14 |
| Status | Em revisão |
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
- [x] Testes com Postgres cobrindo companheiros, rivais, evolução e busca (`social.test.ts`; rodam no fechamento).
- [x] p95 < 50 ms com 100 mil partidas sintéticas: social 14,3 ms, evolução 18,5 ms, busca 6,5 ms (`SOCIAL_BENCH=1 pnpm --filter @outgun/api exec vitest run social.bench`; 16 jogadores por partida, 2 mil contas).
- [x] Esquema OpenAPI atualizado (`openapi.test.ts`).

## Notas técnicas
- —

## Notas de implementação
- Rotas em `routes/social.ts`; migration `0014_social`: colunas `hide_companions`/`hide_history` e três resumos (`player_pairs`, `player_daily`, `rating_points`) atualizados na gravação da partida/delta (`src/social-stats.ts`) e preenchidos pela própria migration. A 1ª versão agregava as partidas a cada pedido e media p95 de 523 ms; com os resumos, cada consulta é uma leitura por índice. Série com os últimos 500 pontos; cache em memória de 30 s (a resposta do dono não entra). Períodos de 7/30 dias contam dias UTC.
- Resumos entram no inventário de dados pessoais (`TABLES`/`DATA_INVENTORY`); excluir a conta apaga em cascata.
- Privacidade: `GET/PUT /account/privacy` e dois alternadores na tela Conta. Histórico escondido também zera `/players/:nome/matches` (campo novo `hidden`), exceto para o dono.
- Busca: prefixo de `usernameKey` (LIKE com curingas escapados) ou clã exato sem diferenciar maiúsculas; o nome exato vem primeiro.
