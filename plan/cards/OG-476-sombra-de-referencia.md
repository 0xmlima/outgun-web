# OG-476 — Sombra de referência no radar: média do clã ou top 10 do mês

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S53 |
| Status | Concluído |
| Dependências | OG-471 |
| Regras de negócio | RN-RAD-01 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero uma referência por baixo do meu radar, para ter contexto sem escolher alguém para comparar.

## Contexto
- Pedido da comunidade (2026-10-28): gráfico de radar para os stats do jogador, com jogador x jogador, clã e clã x clã. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TEoTQesFht8C9vcPvo4N3u); respostas do PO na D-84.
- PO: todos os cards do radar (OG-469 a OG-479) entram na mesma sprint.

## Escopo
- Seletor no painel do perfil: sem referência (padrão) / mediana do meu clã / mediana do top 10 do mês (lista geral, RN-LDB-06).
- Desenhada como série cinza por baixo (OG-470), com legenda.

## Critérios de aceite
- [x] Sem clã, a opção do clã some; top 10 com menos de 10 elegíveis usa quem houver.

## Notas de implementação
- `reference=clan|top10` no `/players/:name/style`: clã = mediana do clã atual do jogador (`clanStyle`, o mesmo do OG-473, clã achado pelo `clan_members`); top 10 = mediana dos perfis dos 10 primeiros da lista geral do período (`overallBoard`), com quem houver.
- No perfil: seletor "Referência" (some na comparação jogador x jogador); a opção do clã só aparece se o jogador tiver clã. É o clã do dono do perfil, não o de quem está vendo.
