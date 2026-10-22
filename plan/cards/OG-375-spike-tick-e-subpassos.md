# OG-375 — Spike: tick de 20 Hz ou subpassos, sem mudar a sensação da física

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Spike |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S39 |
| Status | Pronto |
| Dependências | OG-370 |
| Regras de negócio | D-74 |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero saber quanto o jogo ganharia com um servidor mais rápido que 10 Hz e o que mudaria na física, para decidir com números se vale a mudança na S40.

## Contexto
- O mundo anda a 10 frames/s como o original (`apps/game-server/src/loop.ts`). Mesmo com toda tecla chegando (OG-370), ela só vale no tick seguinte: **0 a 100 ms de espera, 50 ms em média**, e a diagonal "quebra" quando as duas teclas caem em ticks diferentes. É o maior atraso que sobra depois desta sprint.
- A física aceita passos fracionários (`applyPhysics(..., td)`), mas um passo de 1 frame não é igual a dois de 0,5 (comentário em `session.ts`, `extrapolateWith`): trocar a taxa muda trajetórias, alcance de foguete, aceleração. Por isso é spike, não feature.

## Escopo
- Protótipo atrás de opção do servidor (só em sala de teste/privada), comparando:
  1. tick de 20 Hz com a física em meio passo (tudo em `/2`);
  2. tick de 10 Hz com o input aplicado no subpasso em que chegou (o tick parte o frame nos instantes das mudanças);
  3. 10 Hz com dois subpassos fixos de 0,5.
- Medir, contra o 10 Hz atual, em manobras padrão (arrancada, curva em diagonal, frenagem, foguete atravessando a sala, colisão com parede): desvio máximo de posição, velocidade máxima, tempo até a velocidade máxima, alcance.
- Medir custo: CPU por tick com 16 jogadores + bots, banda por jogador (frames a 20 Hz).
- Relatório curto no card com a recomendação e a proposta da D-74 (o PO decide; sala de teste aberta para a comunidade sentir antes).

## Critérios de aceite
- [ ] Tabela de desvios por manobra para as três opções.
- [ ] CPU e banda medidos; cabe na VM Always Free do beta (sem Pay As You Go).
- [ ] Sala de teste com a opção escolhida disponível no beta para a comunidade.
- [ ] D-74 registrada "em aberto" com a recomendação.

## Notas técnicas
- Só o protótipo entra no código, atrás de opção desligada por padrão; nada muda nas salas normais nem nas ranqueadas nesta sprint.

## Notas de implementação
(preenchido durante a execução)
