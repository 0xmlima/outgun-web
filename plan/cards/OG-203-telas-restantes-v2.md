# OG-203 — Salas, replays, ajuda, créditos, legais e feedback no novo visual

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S14 |
| Status | Em revisão |
| Dependências | [OG-201](OG-201-menu-principal-v2.md) |
| Regras de negócio | RN-UI-01 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que todas as telas fora da partida tenham o mesmo visual novo, para o jogo parecer um produto só.

## Contexto
- `screens/lobby.tsx`, `menus.tsx` (Ajuda, Créditos, Código-fonte, Replays), `legal.tsx`, `FeedbackScreen.tsx`, `ui/TextPage.tsx`.

## Escopo
- Lobby em lista/cartões de salas (modo, mapa, ocupação, ping), filtros e criação de sala.
- Replays: abrir arquivo e lista das partidas do jogador.
- Textos longos (ajuda, termos, privacidade, créditos) com tipografia de leitura.
- Remover `BitmapText`/`TextPage` antigos das telas de menu ao final.

## Critérios de aceite
- [x] Nenhuma tela de menu usa fonte bitmap nem a escala de 640×480.
- [ ] E2E do lobby e da criação de sala verdes (seletores atualizados e passo de criação novo; roda no fechamento da sprint).

## Notas técnicas
- —

## Notas de implementação
- `TextPage` virou `Page` + `.ui-prose`; `textBlocks` reestrutura os textos em colunas do original (ajuda, créditos) em títulos, pares e listas. Isso migra ajuda, créditos, código-fonte, termos, privacidade, sobre, perfil, ranking e admin de uma vez; as classes `stats-*`/`admin-*` passaram para os tokens v2.
- Lobby: abas Casual/Ranqueado, busca por sala ou mapa, "esconder lotadas", tabela (sala, mapa, jogadores, ping). Convite e criação de sala viraram `Form` (mapas num `<details>` com caixas). Feedback no `Form` com o novo `TextAreaField`.
- Replays: `MenuList` dentro de `Page` (lista das partidas continua no perfil; o relatório é o OG-214).
- Pendente para o OG-205: `ui/Menu.tsx`, `BitmapText` e a escala `--px` ainda servem ao menu e aos overlays **dentro** da partida.
