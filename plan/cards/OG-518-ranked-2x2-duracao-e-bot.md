# OG-518 — Ranked 2x2: 15 minutos e bot substituto

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S56 |
| Status | Em revisão |
| Dependências | OG-516 |
| Regras de negócio | RN-RKL-19, RN-RKL-25, D-88 |
| Skills | `outgun-card-workflow` |

## História
Como jogador do 2x2, quero partidas mais curtas e regras de queda adequadas a times de dois.

## Contexto
- Proposta 2x2 + OutCup (2026-10-29): artifact https://claude.ai/artifact/CUCHmHonx7Ss4NfXqUv5xf, cópia em `plan/specs/copa-2x2/proposta.html`; respostas do PO com a comunidade na D-88.
- P4: 15 min no 2x2. P11: queda segue o Ranked (pausa de 120 s e voto de bot), mas quem cai tem de conseguir voltar.
- Duração vem do preset Ranked (`packages/settings/src/presets.ts:79`: `time_limit 20`, `extra_time 5`).

## Escopo
- 2x2: 15 min de tempo normal; empate → prorrogação de 5 min como nos outros formatos (até 8 capturas ou 20 min).
- Bot substituto no 2x2: no máximo **1 por lado** (o limite de 2 por partida continua nos demais).
- Física e taxa intocadas (D-74): muda só o tempo de jogo.

## Critérios de aceite
- [x] Partida 2x2 termina aos 15 min (ou 20 com prorrogação) (teste).
- [x] Segundo pedido de bot no mesmo lado do 2x2 é recusado (teste).

## Notas técnicas
- Interpretações a confirmar na revisão: a prorrogação de 5 min vale também no 2x2; o limite de 1 bot por lado.

## Notas de implementação
- `formatGamemod('2x2')` = `time_limit 15` + `extra_time 5`, aplicado sobre o preset travado na criação da sala e mantido no `/reset`.
- `maxSubstitutesPerSide`: 1 por lado no 2x2 (conta bots que entraram e votos abertos do lado); 2 por partida segue valendo.
- No 2x2 a segunda queda do mesmo lado deixa o lado sem humanos, e a D-62 já cancela a partida; o limite de 1 por lado vale também para o voto aberto (teste em `cup-room.test.ts`).
