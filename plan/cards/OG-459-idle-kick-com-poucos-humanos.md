# OG-459 — Jogador parado não é expulso na sala com poucos humanos

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S50 |
| Status | Pronto |
| Dependências | — |
| Issue | [#14](https://github.com/thiagovasconcellos/outgun-web/issues/14) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que quem fica parado na sala seja expulso por inatividade, para não ocupar a vaga nem deixar o time com um a menos.

## Contexto
- Issue #14 (Partida / HUD; médio; sempre). 2.49.0, desktop/Steam no Windows, ozzylords, sala main, 3x3 (Duel), partida c8cf49be: 2 humanos e 6 bots; Elfo* ficou a partida inteira parado (0 abates, 8 mortes).
- O idle kick existe (RN-IDL-01, `Room.playerTimers`, `room.ts:1433`): 120 s (`idlekick_time`), mas só com **4 humanos ou mais** na sala (`idlekick_playerlimit`, padrão do original). Na main com bots isso quase nunca acontece.
- O contador também não anda com o jogador morto (`pl.dead` pula), mas não zera; ok.

## Escopo
- Na sala Casual pública (e nas privadas sem opção em contrário), contar bots para o limite, ou baixar o padrão para 2 humanos; registrar como D-NN (comportamento novo).
- No Ranked não muda (já há pausa e voto do substituto).

## Critérios de aceite
- [ ] Sala com 2 humanos e bots: o humano parado recebe os avisos e sai em 120 s (teste em `room`).
- [ ] Sala com 1 humano sozinho com bots não expulsa ninguém.
- [ ] PO confere.

## Notas de implementação
(preenchido durante a execução)
