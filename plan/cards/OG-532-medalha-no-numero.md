# OG-532 — Medalha do top 3 no número do jogador (não mais na cor do boneco)

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Em revisão |
| Dependências | OG-410, OG-411, OG-413, OG-531 |
| Regras de negócio | RN-NUM-01, D-79 |
| Skills | `outgun-card-workflow` |

## História
Como jogador do pódio do "Melhor do mês", quero o meu número em ouro, prata ou bronze automaticamente, sem perder a minha cor.

## Contexto
- Pedido do PO em 2026-11-01, depois do OG-531: a cor de medalha no boneco exigia que o jogador a escolhesse nas Opções. No número, ela é automática, mais exclusiva (ninguém escolhe a cor do número) e preserva a cor pessoal.
- Decisões do PO: as 3 cores de medalha saem do boneco; quem está no pódio sem número fica sem destaque (a Conta avisa para escolher um).

## Escopo
- O game server manda a medalha no byte de estilo do `playerNumber` (bits 4–5, `packNumberStyle`); sem mudar o protocolo; cliente antigo e replays antigos seguem funcionando.
- Número metálico (reflexo claro no alto, a cor da medalha, tom escuro embaixo) com contorno escuro, nos 4 estilos, na partida, no replay, no espectador e na prévia da Conta.
- Cor de medalha no boneco: o servidor não aceita mais; favoritas salvas perdem a medalha; as Opções não a mostram.
- `GET /account/number` traz `medal`; aviso na Conta para o pódio, com e sem número.

## Critérios de aceite
- [x] Prancha do número com a medalha nos 4 estilos sobre as 32 cores (`plan/specs/og-532-prancha-numero-medalha.png`), para o PO aprovar.
- [x] Teste: o pódio leva a medalha no número; a cor de medalha nas favoritas é recusada.
- [x] Teste: favoritas salvas com medalha voltam para a paleta comum.

## Notas de implementação
- `packNumberStyle`/`unpackNumberStyle` em `packages/protocol/src/colors.ts`; `paintNumber(..., medal)` em `number-styles.ts`; prancha em `tools/visual-compare/medal-number-sheet.mjs`.
- Os índices 32..34 e o brilho do OG-411 no sprite ficam no código (inofensivos), mas nenhum boneco recebe mais essas cores.
