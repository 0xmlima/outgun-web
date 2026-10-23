# OG-409 — Time com a cor e o nome do clã na tela (cliente)

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S43 |
| Status | Em revisão |
| Dependências | OG-408 |
| Regras de negócio | RN-CLA-09, RN-UI-05, D-78 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver o time do clã com as cores e o nome do clã, para a partida ter a cara de quem está jogando.

## Contexto
- Pedido do PO em 2026-10-23 (S43): "um anseio muito antigo da comunidade" — personalização no jogo.
- Os sprites já são montados por máscaras do tema com a cor do time (`apps/web/src/game/render/sprites.ts`, `combine`): dá para montar com qualquer cor.

## Escopo
- Com a identidade do OG-408: boneco, bandeira, base, foguetes, escudo, sangue, minimapa, placar, chat de time e relatório da partida na cor do clã (tons claro/escuro/piscar derivados da cor); "VERMELHO"/"AZUL" vira a tag do clã nos placares e nas mensagens ("[TAG] capturou a bandeira").
- Nada muda de lugar no HUD (RN-UI-05): `pnpm visual:check`, partida online de verdade e capturas ao PO.

## Critérios de aceite
- [x] Partida com um lado de clã: tudo o que era do vermelho (ou azul) na cor do clã, nos HUDs clássico, moderno e personalizado.
- [x] Capturas entregues ao PO (clã x azul e clã x clã com secundária).

## Notas de implementação
- `apps/web/src/game/render/team-palette.ts`: tons do lado (básico, claro, escuro, piscar, mira, placar, fumaça) a partir da cor do clã, numa cópia viva das cores do tema; texturas refeitas, minimapa (cor na chave do cache) e salas redesenhadas (só o pedido mais recente vale). Pisos vermelho/azul dos mapas são decoração e ficam como estão.
- Nomes: placar (Clássico e Moderno), "DK VENCEU", feed (`brandTeams` troca a palavra colorida do lado pela tag), F3/F4 com faixa e texto na cor do clã, pausa, fim de partida e relatório (o game server manda `teams` e a API grava em `matches.team_identity`, migração 0039).
- Capturas: `tools/visual-compare/clan-shots.mjs` (tickets de desenvolvimento com clã, número e medalha): DK x DT, DK x azul padrão e clã x clã com a mesma primária. `visual:check` passa nos três estilos; o relógio do espectador do Moderno ganhou máscara (varia com a velocidade da máquina, como os outros relógios).
