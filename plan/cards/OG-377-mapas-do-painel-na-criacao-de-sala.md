# OG-377 — Mapas do painel em "Criar sala" quando não há rotação Casual no painel

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S40 |
| Status | Em revisão |
| Dependências | OG-367 |
| Regras de negócio | D-69, D-70 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver em "Criar sala" os mapas publicados pela moderação, para jogar neles sem esperar entrarem numa rotação.

## Contexto
- Achado do PO em 2026-10-22 com o mapa `purgatory`, publicado e ativo, já baixado pelo game server: ele não aparece em lugar nenhum. Sem rotação Casual salva no painel (`GET /rotation` → `null`), a escolha livre de `lobby.tsx` lista só os mapas do manifesto (`dir === 'maps'`) e ignora os do painel.

## Escopo
- Com a rotação nula, a lista é a dos mapas do jogo + os ativos do painel (ex.: `GET /rotation` devolve o catálogo, ou uma rota pública com os nomes ativos), com miniatura (OG-368).

## Critérios de aceite
- [x] Sem rotação Casual no painel, um mapa publicado aparece em "Criar sala" e a sala abre com ele.

## Notas de implementação
- `GET /rotation` ganhou `published` (mapas ativos do painel); sem rotação Casual, "Criar sala" lista os do manifesto + esses (miniatura pelo `MapPreview`, que já busca `/maps/:name`). O POST `/rooms` já aceitava qualquer mapa com rotação nula.
- `openapi.json` é regerado no fechamento.
