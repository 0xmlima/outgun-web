# OG-525 — OutCup: sala do confronto criada sozinha, só para os 4

| Campo | Valor |
|---|---|
| Épico | E15 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S56 |
| Status | Em revisão |
| Dependências | OG-524, OG-518 |
| Regras de negócio | RN-CUP-09, D-88 |
| Skills | `outgun-card-workflow` |

## História
Como dupla, quero que a sala do jogo já esteja pronta na hora marcada, sem ninguém de fora ocupando as vagas.

## Contexto
- Proposta 2x2 + OutCup (2026-10-29): artifact https://claude.ai/artifact/CUCHmHonx7Ss4NfXqUv5xf, cópia em `plan/specs/copa-2x2/proposta.html`; respostas do PO com a comunidade na D-88.
- P9: sala criada automaticamente, só os envolvidos entram; espectadores liberados. P11: pausa de 120 s e bot, garantindo que quem cai volta. P12: são ranqueadas sem itens e valem para tudo.

## Escopo
- 15 min antes do horário marcado, a API cria uma sala Ranked 2x2 da copa: vagas travadas para as 4 contas, cada dupla do seu lado, série md3 (final md5).
- Espectadores entram como em qualquer sala (botão "Assistir").
- Partidas contam para rating, estatísticas, leaderboard, marcos e clã, como qualquer ranqueada 2x2.
- Fim da série → resultado vai à chave com os links das partidas.
- Queda: pausa de 120 s e voto de bot (OG-518); quem cai volta à mesma vaga, inclusive entre jogos da série.

## Critérios de aceite
- [x] Conta de fora não entra na sala da copa; espectador entra (teste).
- [x] Jogador que cai e volta dentro dos 120 s retoma a vaga; entre jogos da série a vaga continua reservada para ele (teste).
- [x] Resultado da série avança a dupla na chave (teste).

## Notas técnicas
- —

## Notas de implementação
- Sala `c-*` Ranked 2x2 aberta pelo relógio 15 min antes, com `rooms.cup.sides` no spawn: o game server só aceita essas contas, no lado da dupla (A vermelho, B azul) e sem troca de lado; a API recusa a entrada de outras contas (`cup_room`), espectadores entram pelo `/spectate`.
- Fim da série (rota interna) avança a chave. Série empatada (empates nos jogos): desempate por capturas somadas na série e depois pela cabeça de chave (decisão técnica, `resolution = tiebreak`).
