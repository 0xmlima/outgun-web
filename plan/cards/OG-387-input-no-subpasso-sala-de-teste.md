# OG-387 — Opção de criar sala privada a 20 Hz (padrão continua 10 Hz)

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Could |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-375 |
| Regras de negócio | D-74 |
| Skills | `outgun-card-workflow` |

## História
Como dono de uma sala privada, quero poder escolher um servidor a 20 Hz, para experimentar, sabendo que o jogo normal continua igual.

## Contexto
- Decisão do PO (2026-10-22, D-74): a física do jogo **não muda**. Casual, Ranqueado e as salas persistentes ficam a 10 Hz. 20 Hz só como opção explícita ao criar uma sala privada, desligada por padrão.
- O spike OG-375 mediu o 20 Hz em meio passo: frenagem ~7% mais longa, curvas desviam até 17 u em 2 s, banda por jogador 2×. A sensação muda, por isso fica restrito à sala de quem escolher.

## Escopo
- "Criar sala": caixa "Servidor a 20 Hz (experimental: a física muda um pouco)", desmarcada; a sala mostra o selo "20 Hz" na lista e no HUD.
- `packages/sim`: passo com fração (`applyPlayerAcceleration` e o resto do frame), com fração 1 **bit a bit igual** ao de hoje.
- Game server: taxa por sala (10 ou 20 Hz); cliente: extrapolação, envio de input e replays aceitam a taxa da sala.
- Ranqueado, Casual público e salas persistentes nunca aceitam 20 Hz.

## Critérios de aceite
- [ ] Sem marcar a opção, nada muda: testes de paridade, replays e trajetórias atuais iguais (fração 1).
- [ ] Sala privada criada com 20 Hz roda a 20 Hz; as outras salas do mesmo servidor seguem a 10 Hz.
- [ ] Opção ausente no Ranqueado e no Casual público.

## Notas de implementação
(preenchido durante a execução)
