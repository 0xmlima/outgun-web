# OG-407 — Cores primária e secundária do clã

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S43 |
| Status | Em revisão |
| Dependências | OG-275 |
| Regras de negócio | RN-CLA-09, D-78 |
| Skills | `outgun-card-workflow` |

## História
Como líder de clã, quero escolher a cor primária e a secundária do meu clã, para que o time do clã jogue com as nossas cores.

## Contexto
- Pedido do PO em 2026-10-23 (S43): "um anseio muito antigo da comunidade" — personalização no jogo.
- A cor só aparece na partida pelo OG-408/409; aqui é o cadastro.

## Escopo
- Página do clã (líder e admins do clã): cor primária e secundária escolhidas numa paleta curada (cores de time legíveis sobre os fundos dos temas), com prévia do boneco e da bandeira.
- Recusa primária e secundária parecidas demais entre si (CIEDE2000 < 22), para a secundária servir de reserva. A colisão com a cor do outro lado (vermelho/azul padrão ou outro clã) é resolvida na partida (OG-408); assim um clã pode escolher vermelho ou azul.
- API: campos no clã, auditoria da troca; perfil público do clã mostra as cores.

## Critérios de aceite
- [x] Líder (e admins do clã) escolhem primária e secundária; membro comum não edita.
- [x] Par parecido demais ou cor fora da paleta é recusado com mensagem (teste).

## Notas de implementação
- Paleta `CLAN_COLORS` (18 cores) e `colourDistance`/`clanColoursProblem` em `packages/protocol/src/colors.ts` (o servidor do jogo usa a mesma distância no OG-408, limite `TEAM_COLOUR_MIN_DISTANCE` = 22). Colunas `primary_color`/`secondary_color` (migração 0038), `PATCH /clans/:tag` com `colors` (null tira); página do clã mostra as duas bandeiras. Sem auditoria à parte (a edição do clã nunca teve).
