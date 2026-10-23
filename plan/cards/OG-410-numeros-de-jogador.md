# OG-410 — Números de jogador (2 a 99, o 1 para o líder do mês)

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S43 |
| Status | Em revisão |
| Dependências | OG-358 |
| Regras de negócio | RN-NUM-01, D-79 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero um número só meu no boneco, como na Fórmula 1, para ser reconhecido na partida.

## Contexto
- Pedido do PO em 2026-10-23 (S43): "um anseio muito antigo da comunidade" — personalização no jogo.
- Decisões do PO (D-79): números únicos de 2 a 99; o 1 é do líder do "Melhor do mês" (índice geral, OG-358) do mês anterior e o uso é opcional; número de quem ficar 60 dias sem jogar é liberado (com aviso); troca a cada 30 dias.

## Escopo
- Escolha no perfil/conta, por ordem de chegada, com a lista dos livres; troca a cada 30 dias; liberação automática depois de 60 dias sem jogar, com notificação antes (7 dias) e na liberação.
- Número 1: na virada da temporada, o líder do "Melhor do mês" pode usar o 1 durante o mês seguinte (opção "usar o número 1"), sem perder o número dele.
- Na partida: número no centro do boneco, com contorno para ler sobre qualquer cor; some com zoom muito afastado. Protocolo leva o número de cada jogador; convidados e bots sem número.

## Critérios de aceite
- [x] Dois jogadores não ficam com o mesmo número (teste, inclusive em corrida).
- [x] Número liberado depois de 60 dias sem jogar e troca só a cada 30 (teste).
- [x] O 1 vai para o líder do mês na virada e é opcional (teste).
- [x] Capturas do número no boneco ao PO (RN-UI-05).

## Notas de implementação
- `apps/api/src/player-numbers.ts` + `GET/PUT /account/number` e `PUT /account/number-one` (migração 0040: `player_number` com índice único, `number_changed_at`, `number_warned_at`, `use_number_one`; notificações `number_expiring`/`number_released`). Liberação conferida a cada hora pelo `main.ts`.
- Ticket leva `number` (1 para o líder que optou); mensagem `playerNumber` (132) depois do `playerJoined` e no `welcome`. Desenho: branco com contorno na cor escura do time, escala do raio do boneco; some com o boneco menor que 9 px.
- Conta: lista com os livres e o aviso da próxima troca; perfil mostra o número. "Ordem de chegada" no próprio índice único (teste de corrida).
