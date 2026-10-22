# OG-375 — Spike: tick de 20 Hz ou subpassos, sem mudar a sensação da física

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Spike |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S40 |
| Status | Concluído |
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
- [x] Tabela de desvios por manobra para as três opções.
- [x] CPU e banda medidos; cabe na VM Always Free do beta (sem Pay As You Go).
- [ ] Sala de teste com a opção escolhida disponível no beta para a comunidade. → **não se aplica:** o PO decidiu não mexer na física (D-74); 20 Hz só como opção de sala privada (OG-387, Backlog).
- [x] D-74 registrada "em aberto" com a recomendação.

## Notas técnicas
- Só o protótipo entra no código, atrás de opção desligada por padrão; nada muda nas salas normais nem nas ranqueadas nesta sprint.

## Notas de implementação
Medido com `node tools/dev/tick-spike.mjs` (reaproveitável). Jogador tem raio 15 u; sala 640 × 460 u. Opção 3 (dois subpassos fixos) tem a física da coluna "calibrado" com o input ainda esperando o meio frame.

### Física (posição em unidades; uma sala tem 640 × 460)

Velocidade máxima correndo: 10 Hz 29.50 u/frame · meio passo ingênuo 28.74 · meio passo calibrado 29.50
Tempo até 95% da máxima: 10 Hz 2.9 s · ingênuo 3.5 s · calibrado 3 s

| Manobra | Meio passo ingênuo (desvio máx.) | Meio passo calibrado (desvio máx.) | Input no subpasso (desvio máx., chegada no meio do frame) |
|---|---|---|---|
| Arrancada (2 s para a direita) | 17.3 u | 13.0 u | 15.8 u |
| Diagonal (2 s, cima+direita) | 17.3 u | 13.0 u | 15.8 u |
| Frenagem (solta tudo na velocidade máxima) | 8.4 u | 12.4 u | 15.6 u |
| Curva (na máxima para a direita, vira para cima) | 18.1 u | 16.6 u | 20.1 u |

Distância de frenagem: 10 Hz 179.2 u · ingênuo 187.6 u · calibrado 191.6 u
Foguetes (velocidade constante) e quiques em parede (tempo contínuo até a parede): sem desvio.

### Custo (sala outgun1, 1 humano + 15 bots, 60 s)

Tick da sala: média 1.05 ms · p95 1.75 ms (orçamento a 10 Hz: 100 ms; a 20 Hz: 50 ms)
Banda para o humano: 1.3 KB/s a 10 Hz → ~2.6 KB/s a 20 Hz (frames dobram; subpassos a 10 Hz não mudam a banda)


### Leitura
- **20 Hz em meio passo (1 e 3):** a física muda em tudo. Mesmo calibrado para manter a velocidade máxima, a frenagem fica 12 u mais longa (~7%) e a curva desvia 17 u em 2 s (mais de um raio de jogador). É a "sensação" que muda; a ingênua ainda perde 2,6% da velocidade máxima. Custo: CPU 2× (sobra: ~1 ms de 50 ms por sala) e banda 2× por jogador (~2,6 KB/s).
- **Input no subpasso (2):** com as teclas paradas, a física é **idêntica** à de hoje. Só o frame em que a tecla muda é partido no instante da chegada; o desvio da tabela é exatamente a espera que some (a tecla vale meio frame antes, em média). Banda igual, CPU igual.
- **Recomendação:** opção 2 (10 Hz, input aplicado no instante em que chegou, frame partido com o passo calibrado). Tira a espera de 0 a 100 ms do servidor sem mexer na sensação de quem só corre; a previsão do cliente passa a bater mais com o servidor (menos correção). 
- **Decisão do PO (2026-10-22):** a física não muda; o spike não alterou código do jogo (só `tools/dev/tick-spike.mjs` e documentos). 20 Hz fica para o OG-387, como opção de sala privada, padrão 10 Hz.
