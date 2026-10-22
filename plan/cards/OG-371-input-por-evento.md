# OG-371 — Teclas lidas no evento, não no quadro

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S39 |
| Status | Em revisão |
| Dependências | OG-370 |
| Regras de negócio | D-71 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que um toque rápido de tecla sempre conte, para não perder tiros nem desvios curtos.

## Contexto
- `GameInput` só guarda as teclas num `Set`; os controles são lidos por amostragem (`input.sample()`) no quadro da tela e no timer de envio (`apps/web/src/game/host.ts:481`). Entre a tecla e o envio passa até um quadro inteiro (16 ms a 60 FPS, 33 ms com limite de 30), e uma tecla apertada e solta entre duas amostras **some** (tiro e largar bandeira inclusive).

## Escopo
- `keydown`/`keyup` recalculam os controles e chamam o envio na hora (via OG-370); bordas de tiro e de largar bandeira saem do evento, com ordem garantida (tiro depois do controle da mesma tecla).
- Toque mais curto que um quadro chega como "aperta + solta" ao servidor; o tiro curto sempre sai (`attackOnce` do servidor). Movimento mais curto que um tick continua não andando, como no original.
- Gamepad continua por amostragem (a API não tem eventos), mas amostrado também no timer de envio, não só no quadro.
- Sem mudança de associações nem das opções de teclas.

## Critérios de aceite
- [x] Tecla de tiro apertada e solta em 5 ms dispara um tiro (teste unitário com eventos sintéticos).
- [ ] Com limite de 30 FPS, tecla→tela do OG-369 fica em até um quadro (p95 ≤ 35 ms). **Não atingido:** p95 39–56 ms (era 70–93); a mediana ficou em 19–21 ms. O que falta é a mudança que perde o tick do envio e espera o próximo (ver OG-370 e OG-375). (Tecla→envio deixou de ser a medida certa: pelo OG-370, a mudança que não pega mais o tick espera de propósito o próximo envio.)
- [x] Menu aberto, perda de foco e modo foco continuam soltando as teclas.

## Notas de implementação
- `GameInput.onChange`: avisa a cada tecla do jogo apertada/solta (sem repetição automática) e ao soltar tudo (menu, perda de foco); o host lê e envia na hora. O timer de 10 Hz segue enviando e amostrando o gamepad. Testes em `input.test.ts` (eventos sintéticos num `EventTarget`).
