# OG-408 — Identidade do clã na partida: quando o lado vira o clã (servidor)

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S43 |
| Status | Concluído |
| Dependências | OG-407 |
| Regras de negócio | RN-CLA-09, D-78 |
| Skills | `outgun-card-workflow` |

## História
Como jogador de clã, quero que o meu lado vire o clã na partida quando só tem gente do clã, para jogar "CLÃ x AZUL".

## Contexto
- Pedido do PO em 2026-10-23 (S43): "um anseio muito antigo da comunidade" — personalização no jogo.
- Decisão do PO (D-78): bots e humanos sem clã não contam; basta 2 humanos do mesmo clã num lado e nenhum humano de outro clã; vale a partir da próxima rodada. Exemplo do PO: 3x3 com 2 do DK + 1 sem clã de um lado e 2 do DT + 1 bot do outro → DK x DT.

## Escopo
- No início de cada rodada (mapa novo; no Ranked, cada jogo da série), o servidor olha os humanos de cada lado: ≥ 2 humanos do mesmo clã e nenhum humano de outro clã (sem clã e bots não contam) → o lado é o clã (tag, nome, cor); dois clãs no mesmo lado → cor padrão. A identidade fica fixa a rodada inteira; entradas e saídas no meio só contam na próxima.
- Cor: a primária; se ficar parecida com a cor do outro lado (o outro clã ou o vermelho/azul padrão), a secundária; se a secundária também, a cor padrão do lado. Clã x clã com a mesma primária: o lado azul (o segundo) usa a secundária.
- Mensagem nova do protocolo com a identidade de cada lado (no `welcome` para quem entra, e no replay); Casual e Ranked.

## Critérios de aceite
- [x] 3x3 com 2 do DK + 1 sem clã contra 2 do DT + 1 bot → DK x DT (teste).
- [x] Um humano de outro clã entrando no lado no meio da rodada só desfaz na seguinte; um sem clã não desfaz (teste).
- [x] Clã x clã com a mesma primária: um usa a secundária; colisão nas duas: cor padrão (teste).

## Notas de implementação
- Regra pura em `apps/game-server/src/team-identity.ts` (testes do exemplo do PO, secundária, padrão e clã x clã); limite de cor `TEAM_COLOUR_MIN_DISTANCE` (CIEDE2000 < 22). O vermelho só se ajusta ao azul padrão; contra outro clã quem troca é o azul.
- Ticket: `clanId` agora também no Casual e `clanTeam` (tag sem decoração, nome, cores) quando o clã tem cores. Mensagem `teamIdentity` (131): no `welcome`, no replay e a cada mudança.
- Quando recalcula: no início de cada rodada (Casual e cada jogo do Ranked) e, além disso, enquanto a rodada "nem começou" (0 x 0 nos primeiros 30 s), para a sala que está enchendo não esperar uma rodada inteira. Depois disso, entradas e saídas só valem na rodada seguinte.
- Ajuste do PO (2026-10-23): no Ranked a identidade sai do lobby (a cada mudança de lado) e fica fixa durante o jogo; o recálculo dos primeiros 30 s vale só no Casual. O lobby mostra a tag e a cor do clã. Teste em `ranked-lobby.test.ts`.
