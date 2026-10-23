# OG-394 — Aviso de marco novo: no relatório da partida e um toast ao voltar ao menu

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S41 |
| Status | Concluído |
| Dependências | OG-390 |
| Regras de negócio | RN-SOC-03, RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero saber na hora que conquistei um marco, para comemorar sem precisar abrir o perfil.

## Contexto
- O relatório já lista os marcos da partida (`MatchReport.tsx`, "badges"). Não há aviso fora dele. HUD da partida não muda (RN-UI-05).

## Escopo
- Relatório: marcos da partida com ícone e nome; secreto aparece com destaque ("Marco secreto desbloqueado!").
- Ao voltar ao menu depois de uma partida, toast com os marcos novos da conta (um por marco, até 3, depois "+N"), com link para o perfil.

## Critérios de aceite
- [x] Toast aparece uma vez por marco (não repete ao recarregar).
- [x] Nenhum elemento novo dentro da partida.

## Notas de implementação
- O aviso vem pelas notificações do OG-361 (tipo `milestone`, uma por partida com os marcos novos), criadas só no fim de partida ao vivo, nunca no retroativo. O toast some sozinho e já marca como lida; a notificação fica no sino e leva ao perfil.
- As notificações só existem no Shell (fora da partida), então nada aparece por cima do HUD.
- Relatório: badge com o ícone; secreto em destaque ("Marco secreto: Ás"), com o nome mandado pela API.
