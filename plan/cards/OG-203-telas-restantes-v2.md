# OG-203 — Salas, replays, ajuda, créditos, legais e feedback no novo visual

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S14 |
| Status | Backlog |
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
- [ ] Nenhuma tela de menu usa fonte bitmap nem a escala de 640×480.
- [ ] E2E do lobby e da criação de sala verdes.
- [ ] Prints de todas as telas.

## Notas técnicas
- —

## Notas de implementação
(preenchido durante a execução)
