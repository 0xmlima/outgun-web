# OG-490 — Treino: sala de treino e ciclo da tentativa no servidor

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S55 |
| Status | Em revisão |
| Dependências | OG-289 |
| Regras de negócio | RN-TRN-01, RN-TRN-02, RN-TRN-06, RN-UI-05, D-86 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero uma sala que repete a mesma situação de jogo em tentativas curtas, para treinar um fundamento sem jogar uma partida inteira.

## Contexto
- Pedido do PO (2026-10-28): presets de treino na sala privada Casual. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TZn2Kuj8ZwDVQfoB5G8Rbn, cópia em `plan/specs/modos-de-treino/proposta.html`); respostas na D-86.

## Escopo
- Tipo de sala `training` no game-server, com o modo (Ataque, Defesa, Fuga, Captura) e as opções vindas da criação da sala (OG-492). Sem placar de partida, tempo limite, troca de mapa por fim de partida nem tela de fim.
- Juiz da tentativa: posicionar todos nos pontos do modo, contagem curta (3-2-1, todos parados), jogar, resultado (sucesso/falha + motivo + tempo), reinício ~2 s depois. Cada modo (OG-493 a OG-496) só fornece o posicionamento e as condições de fim.
- Detecção de "sair do quadrado da base" (RN-TRN-02) como utilitário compartilhado pelos modos.
- Resultado mostrado no aviso central e no chat que já existem (RN-UI-05: nada se move no HUD).
- Física e armas de sempre (10 Hz, D-74).

## Critérios de aceite
- [x] Uma sala de treino roda tentativas em laço, com resultado e reinício, sem fim de partida.
- [x] Testes do juiz com um modo de teste (posicionar → contagem → fim → reinício).
- [ ] `pnpm visual:check`, partida online real e capturas ao PO (aviso do resultado).

## Notas técnicas
- Reaproveitar o reinício de rodada do servidor (o mesmo de "reiniciar na hora" do OG-289), sem passar pelo fim de partida.
- Interpretação da P1 a confirmar na revisão: "quadrado da base" = a sala (tela) onde fica o ponto da bandeira do time (`map.teams[t].flags`); o mapa não tem outra área de base.

## Notas de implementação
- Juiz em `apps/game-server/src/training.ts` (`TrainingSession`, fases idle → contagem 3 s → jogo → resultado 2 s); modos plugáveis em `training-modes.ts`. Sala: `RoomOptions.training`, sem tempo/captura limite, power-ups desligados, lados fixos, sem chat de bot; eventos do frame entregues ao juiz depois da simulação (o morto já está morto).
- Mensagem nova `trainingState` (134); o cliente mostra a contagem e o resultado na mesma caixa da pausa do Ranked (nada novo no HUD). Tentativa sem fim falha em 2 min ("timeout").
- "Quadrado da base" = sala da bandeira (`outOfBaseRoom`); `Placement` acha a sala a N passos da base no caminho entre as bases e pontos livres de parede.
- Pendente no fechamento: `visual:check`, partida online real e capturas ao PO.
