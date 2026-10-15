# OG-208 — Tela inicial viva: quem está jogando e o ranking do mês

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S18 |
| Status | Backlog |
| Dependências | [OG-267](OG-267-temporadas-mensais.md) |
| Regras de negócio | RN-UI-01, RN-UI-03, RN-UI-04, RN-SOC-01 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver na tela inicial quem está jogando agora e como está o ranking do mês, para ter vontade de entrar numa partida e continuar subindo.

## Contexto
- Hoje a tela inicial (`HomeScreen`, `apps/web/src/screens/menus.tsx`) tem o menu e, com conta, "Suas partidas recentes". Convidados veem só o menu.
- Os dados já existem na API: salas abertas com jogadores (`GET /rooms`), leaderboard da temporada ativa (`GET /leaderboard`, OG-267) e minha posição (`GET /ranking`).
- Pedido do PO em 2026-10-15: mostrar o status de outros jogadores e o ranking mensal para segurar o jogador no jogo.

## Escopo
- Painel **"Agora no Outgun"**: jogadores online (soma das salas), salas com gente (até 3, com mapa, modo e `n/max`) e um botão para entrar na sala; se não houver ninguém, um convite para o "Jogar agora".
- Painel **"Ranking de <mês>"**: top 5 da temporada ativa (posição, nome com link para o perfil, rating) e, com conta, a minha posição ("Você: 12º de 87"), ou "Jogue Ranked para entrar no ranking". Link para `/ranking`.
- Os dois painéis aparecem também para convidados; "Suas partidas recentes" continua só com conta.
- Atualização leve: ao abrir a tela e a cada 30 s enquanto ela estiver visível.

## Fora do escopo (cards futuros, se o PO quiser)
- Feed global de partidas recentes ("Fulano capturou 3 bandeiras no Coliseu") e amigos online: pedem endpoint novo.
- Destaques do mês (mais capturas, maior sequência): depende do OG-268 (hall da fama).

## Critérios de aceite
- [ ] "Jogar agora" continua a um clique e é o primeiro item focado (RN-UI-04); os painéis não empurram o menu para fora da primeira tela em 1280×720.
- [ ] Funciona de 360 px a telas grandes, por teclado, mouse, toque e gamepad (RN-UI-01); só tokens e componentes do design system.
- [ ] Sem temporada ativa, sem salas ou com a API fora do ar, cada painel mostra um estado vazio ou de erro próprio e o menu continua usável.
- [ ] Mapa das salas pelo título (depende do OG-207, se estiver pronto; senão o arquivo).

## Notas técnicas
- Só cliente: reaproveitar `useApi` (`apps/web/src/screens/stats.tsx`), `Panel`, `Table` e `Badge`. Nenhum endpoint novo.
- Pausar o polling com `document.visibilityState` e ao sair da tela.

## Notas de implementação
(preenchido durante a execução)
