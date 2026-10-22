# OG-371 — Teclas lidas no evento, não no quadro

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S39 |
| Status | Pronto |
| Dependências | OG-370 |
| Regras de negócio | D-71 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que um toque rápido de tecla sempre conte, para não perder tiros nem desvios curtos.

## Contexto
- `GameInput` só guarda as teclas num `Set`; os controles são lidos por amostragem (`input.sample()`) no quadro da tela e no timer de envio (`apps/web/src/game/host.ts:481`). Entre a tecla e o envio passa até um quadro inteiro (16 ms a 60 FPS, 33 ms com limite de 30), e uma tecla apertada e solta entre duas amostras **some** (tiro e largar bandeira inclusive).

## Escopo
- `keydown`/`keyup` recalculam os controles e chamam o envio na hora (via OG-370); bordas de tiro e de largar bandeira saem do evento, com ordem garantida (tiro depois do controle da mesma tecla).
- Toque mais curto que um quadro vira "aperta + solta" no servidor: o controle fica ligado pelo menos até o próximo tick (um tiro curto sempre sai).
- Gamepad continua por amostragem (a API não tem eventos), mas amostrado também no timer de envio, não só no quadro.
- Sem mudança de associações nem das opções de teclas.

## Critérios de aceite
- [ ] Tecla de tiro apertada e solta em 5 ms dispara um tiro (teste unitário com eventos sintéticos).
- [ ] Com limite de 30 FPS, tecla→envio do OG-369 fica abaixo de 2 ms (p95).
- [ ] Menu aberto, perda de foco e modo foco continuam soltando as teclas.

## Notas de implementação
(preenchido durante a execução)
