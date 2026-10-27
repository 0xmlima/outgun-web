# OG-439 — Resposta gradual: advertência, ban explicado e recurso

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-438 |
| Regras de negócio | RN-PLT-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador punido, quero saber por que e até quando, e poder contestar, para que a punição seja proporcional e justa.

## Contexto
- Hoje só existe ban (conta, IP, dispositivo ou sala) com duração e motivo; a primeira punição já é o ban, e quem tenta entrar só recebe "you are banned from this room" (`apps/api/src/routes/join.ts`), sem motivo nem prazo.
- Sem uma etapa intermediária, o moderador hesita em banir e o suspeito continua jogando.

## Escopo
- Histórico de confiança por conta: cada punição confirmada por um moderador (OG-438) sobe um degrau; partidas limpas por um prazo descem um degrau. Visível só para o moderador.
- Degraus e o que cada um faz: normal → **advertência** (notificação no sino, OG-361, e aviso na próxima entrada) → ban temporário (prazo sugerido pelo degrau, o moderador confirma) → ban sem prazo.
- O ban mostra motivo e data de fim ao tentar entrar e na tela da conta; expira sozinho e não deixa resto ao voltar.
- Recurso: pedido pela tela da conta para advertência ou ban, com a punição e a partida ligadas, caindo na fila de moderação; o resultado volta como notificação.
- Nada automático: degrau só muda por decisão de um moderador.
- Termos e privacidade (`apps/web/src/screens/legal.tsx`) explicam os degraus, o recurso e a retenção do histórico.

## Critérios de aceite
- [ ] Advertência chega como notificação e aparece na próxima entrada; fica no histórico do moderador.
- [ ] Ban temporário mostra motivo e data ao entrar e expira sozinho no prazo.
- [ ] Pedido de recurso abre na fila de moderação com a punição e a partida ligadas; a resposta chega ao jogador.
- [ ] Degrau só sobe por decisão humana; teste cobre a descida após partidas limpas.

## Notas técnicas
- `bans` já tem `reason`, `expiresAt` e alvo por conta/IP/dispositivo; advertência e recurso são tabelas novas (migração nova).
- O join pode devolver `reason` e `expiresAt` no erro `banned`; o cliente mostra no visual v2.
- **Decisão do PO antes do Pronto:** prazo de cada degrau e de "partidas limpas".
- A punição em sombra ficou no OG-441 (depende de decisão de produto).

## Notas de implementação
—
