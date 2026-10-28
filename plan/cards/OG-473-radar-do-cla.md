# OG-473 — Radar do clã: mediana dos membros e mini radar de cada membro

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S53 |
| Status | Em revisão |
| Dependências | OG-469, OG-470, OG-273 |
| Regras de negócio | RN-RAD-05, RN-CLA-06 |
| Skills | `outgun-card-workflow` |

## História
Como membro ou visitante, quero ver o formato do clã e de cada membro, para entender como o time divide os papéis.

## Contexto
- Pedido da comunidade (2026-10-28): gráfico de radar para os stats do jogador, com jogador x jogador, clã e clã x clã. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TEoTQesFht8C9vcPvo4N3u); respostas do PO na D-84.
- PO: todos os cards do radar (OG-469 a OG-479) entram na mesma sprint.

## Escopo
- Radar do clã = **mediana** dos percentis dos membros, eixo a eixo, contando só as ranqueadas jogadas pelo clã (RN-RAD-05, D-84). Membros abaixo do mínimo de partidas pelo clã ficam fora da mediana.
- Página do clã (painel Estatísticas do OG-273): radar na cor do clã, arquétipo do clã, ponto forte e ponto fraco.
- Grade com um mini radar por membro (OG-470), com nome e arquétipo; "poucos jogos" quando for o caso.
- Mesmos filtros de período e formato da página do clã.

## Critérios de aceite
- [x] Testes: mediana com número par e ímpar de membros; membro que saiu não leva os números antigos (RN-CLA-06); membro com poucas partidas fica fora.

## Notas de implementação
- `clanStyle` (api): membros **atuais** do clã (`clan_members`), cada um pelas ranqueadas com `match_players.clan_id` do clã, em percentil contra os ativos do período (a mesma base do perfil); entra na mediana quem tem 3+ partidas pelo clã. Rota `GET /clans/:tag/style` (temporada ou `overall`).
- Ponto forte/fraco = maior/menor eixo da mediana (empate: ordem dos eixos). Painel `screens/clan-style.tsx` na página do clã, na cor primária do clã; a página do clã não tem filtro de formato, então o radar também não.
- Série `percentOnly` no componente: a mediana não tem valor bruto.
