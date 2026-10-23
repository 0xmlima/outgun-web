# OG-399 — Marcos de humor (7x1, freguês, mão de alface...) e a virada do 7x1

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 4 pts |
| Sprint | S41 |
| Status | Concluído |
| Dependências | OG-391, OG-398 |
| Regras de negócio | RN-SOC-03, RN-SOC-06 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero marcos em tom de humor, com o vocabulário do futebol brasileiro, para rir das derrotas (e das viradas) com a comunidade.

## Contexto
- Pedido e aprovado pelo PO em 2026-10-23. A ranqueada vai até 8 capturas (`packages/settings/src/presets.ts`), então o placar passa por 1 a 7 antes do fim; o momento sai dos eventos de captura (OG-362).

## Escopo
- Grupo novo `humor` no perfil (OG-393); os marcados como secretos ficam no grupo `secret` e seguem a RN-SOC-06.
- Marcos (id estável · nome pt/en · condição):
  - `secret_seven_one` E lá vem eles de novo / Here they come again · **secreto** · numa ranqueada, seu time chegou a estar perdendo de 7 a 1 (alusão ao 7x1 da Copa de 2014).
  - `secret_seven_one_comeback` Revanche do Mineirão / Mineirão revenge · **secreto** · venceu uma ranqueada depois de estar perdendo de 7 a 1. Quem ganha este ganha também o anterior.
  - `secret_choked` Amarelou / Choked · **secreto** · perdeu uma série md5 depois de estar 2 a 0.
  - `secret_series_comeback` Virada histórica / Historic comeback · **secreto** · perdeu os dois primeiros jogos de uma série md5 e venceu por 3 a 2.
  - `humor_today_yes` Hoje não, hoje não... hoje sim? / Not today, not today... today? · numa partida, pegou a bandeira e morreu com ela 3 vezes seguidas e capturou na 4ª tentativa (alusão ao meme). Se a calibração mostrar que é raro, vira secreto.
  - `humor_customer` Freguês / Regular customer · morreu 10 vezes para o mesmo jogador numa partida.
  - `humor_butterfingers` Mão de alface / Butterfingers · pegou e largou a bandeira 5 vezes numa partida, sem capturar.
  - `humor_ball_hog` Fominha / Ball hog · fez todas as capturas do time numa vitória (mínimo de 4).
  - `humor_punching_bag` Saco de pancada / Punching bag · morreu 30 vezes numa partida.
  - `humor_sightseeing` Só passeando / Just sightseeing · 10+ min jogados com 0 kills, 0 capturas e 0 defesas.
  - `humor_runner_up` Vice / Runner-up · 2º lugar num quadro do hall da fama (junto do OG-392).
- Mesmas regras contra farm do OG-398 (4+ contas na partida) e calibração no `milestones-calibrate`.

## Critérios de aceite
- [x] Testes de cada marco, inclusive 3 mortes com a bandeira e captura na 4ª (concede) contra captura na 3ª (não concede), 1 a 7 que vira 8 a 7 (concede os dois secretos) e 1 a 6 que não concede nada.
- [ ] Calibração do beta no card; os dois do 7x1 devem sair raríssimos (esperado 0 hoje).

## Notas técnicas
- Ficaram de fora por ora: Café com leite (morrer para bots briga com o anti-farm), Pé frio (histórico por companheiro) e Morreu na praia (posição da base por mapa).

## Notas de implementação
- Visíveis no grupo `humor` do catálogo; os quatro secretos (7x1, revanche, amarelou, virada histórica) no módulo dos secretos (OG-398).
- "Perdendo de 7 a 1" = o placar passou por 1 a 7 em algum momento (inclusive vindo de 0 a 7). Mão de alface usa `stats.flagsDropped`, sem depender de eventos.
- Vice está no catálogo, mas é concedido no fechamento da temporada, junto do OG-392.
- Pendente: calibração no beta (critério 2).
