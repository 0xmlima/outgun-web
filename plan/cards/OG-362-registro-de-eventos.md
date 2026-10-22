# OG-362 — Registro dos eventos de cada ranqueada

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S38 |
| Status | Pronto |
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
- [ ] Teste do game server: uma partida curta gera os eventos na ordem, com os momentos certos.
- [ ] Teste da API: grava e devolve os eventos de uma partida; reenvio não duplica.
- [ ] Tamanho medido numa partida de 20 min (anotar nas notas).

## Notas de implementação
(preenchido durante a execução)
