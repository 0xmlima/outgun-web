# OG-362 — Registro dos eventos de cada ranqueada

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S38 |
| Status | Em revisão |
| Dependências | OG-355 |
| Regras de negócio | RN-LDB-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que o jogo guarde o que aconteceu em cada momento da partida, para que existam stats como multi-kill, troca e "quem matou quem".

## Contexto
- Parte 1 do OG-356 (quebrado na S38). Hoje cada partida guarda só os totais por jogador.

## Escopo
- Game server: durante a ranqueada, registra de forma compacta cada abate (matador, vítima, momento em décimos de segundo, sala da vítima, se a vítima carregava bandeira, tipo de dano) e cada ação de bandeira (pegar, largar, devolver, capturar), a partir dos hooks da sim que já existem (`kill`, `flagTaken`, `flagDropped`, `flagReturned`, `flagCaptured`).
- O relatório da partida leva os eventos (limite de tamanho, com o slot e a conta de cada jogador); a API guarda numa tabela própria ligada à partida, com migration reversível.
- Só ranqueadas concluídas; a cancelada não envia nada (como hoje). Fica no inventário de privacidade.

## Critérios de aceite
- [x] Teste do game server: uma partida curta gera os eventos na ordem, com os momentos certos.
- [x] Teste da API: grava e devolve os eventos de uma partida; reenvio não duplica.
- [ ] Tamanho medido numa partida de 20 min (anotar nas notas).

## Notas de implementação
- Game server: `MatchEventRecorder` (`apps/game-server/src/match-events.ts`), tuplas compactas `[t, tipo, ...]` com t em décimos de mapa; jogadores por índice numa lista (slot reaproveitado vira outra entrada); teto de 5000 eventos; reset no começo do jogo e no cancelamento. Largada por captura não vira evento (a captura já registra).
- API: migration 0032, `match_events` (jsonb) + `match_event_players` (conta com `ON DELETE SET NULL`; nome vira "(anon)" na exclusão); `GET /matches/:id/events` (`events` null = sem registro). Inventário de privacidade atualizado.
- Tamanho numa partida de 20 min: medido no fechamento da sprint.
