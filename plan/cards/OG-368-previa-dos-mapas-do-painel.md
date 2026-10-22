# OG-368 — Prévia e miniatura dos mapas, inclusive os do painel

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S38 |
| Status | Em revisão |
| Dependências | OG-367 |
| Regras de negócio | D-70 |
| Skills | `outgun-card-workflow` |

## História
Como moderador e jogador, quero ver a prévia dos mapas publicados pelo painel como a dos mapas do jogo, para que um dia mapas da comunidade possam entrar até nas rotações competitivas.

## Contexto
- A prévia (OG-214) é um SVG desenhado no navegador a partir do texto do mapa e só lê os assets do jogo: mapa do painel fica sem prévia (votação do lobby Ranked, relatório). Não existe miniatura em imagem para nenhum mapa.

## Escopo
- A prévia busca na API (`GET /maps/:name`) o mapa que não está nos assets, com cache.
- Miniatura (a mesma prévia, pequena) na escolha de mapas da sala privada, na aba "Mapas" e na aba de rotações do painel, para todos os mapas.
- Aba "Mapas": prévia do arquivo antes de publicar (desenhada do texto enviado).

## Critérios de aceite
- [x] Mapa do painel tem prévia na votação do lobby Ranked e no relatório, como os do jogo.
- [x] Miniaturas na sala privada e no painel; prévia antes de publicar.
- [x] Teste: a busca da prévia cai na API quando o mapa não está nos assets.

## Notas de implementação
- `previewMap` (MapPreview.tsx): assets do jogo, senão `GET /maps/:name` da API; cache por nome; gerados e `random_map` ficam sem. `MapPreview` ganhou `thumb` (miniatura 6×4,5 rem) e `MapDrawing` (desenho de um mapa já carregado).
- Miniaturas: escolha de mapas da sala privada (só carrega com a lista aberta), abas "Mapas" e "Rotações" do painel. Aba "Mapas": prévia do arquivo depois de "Conferir", desenhada do texto enviado.
- Continua sendo SVG desenhado no navegador (os mapas do jogo também não têm imagem pronta); a votação do lobby Ranked e o relatório passam a mostrar os mapas do painel sem mudança nessas telas.
