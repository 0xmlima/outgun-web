# OG-479 — Filtro por mapa no radar

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Could |
| Estimativa | 2 pts |
| Sprint | S53 |
| Status | Pronto |
| Dependências | OG-471 |
| Regras de negócio | RN-RAD-02 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver meu radar num mapa específico, porque meu papel muda de mapa para mapa.

## Contexto
- Pedido da comunidade (2026-10-28): gráfico de radar para os stats do jogador, com jogador x jogador, clã e clã x clã. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TEoTQesFht8C9vcPvo4N3u); respostas do PO na D-84.
- PO: todos os cards do radar (OG-469 a OG-479) entram na mesma sprint.

## Escopo
- Filtro de mapa no radar do perfil e na comparação jogador x jogador.
- Percentil contra quem jogou aquele mapa no período, com o mesmo mínimo de partidas (RN-RAD-03) contado só naquele mapa.

## Critérios de aceite
- [ ] Mapa com poucos jogadores no período mostra "poucos jogos neste mapa" em vez do radar.

## Notas de implementação
