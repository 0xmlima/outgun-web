# OG-439 — Resposta gradual: aviso, sombra e banimento temporário

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-436, OG-053, OG-104 |
| Regras de negócio | RN-PLT-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que a punição seja proporcional, e como operador, que o suspeito confirmado não leve a conta de graça para outra sala.

## Contexto
- Hoje só existe ban (conta, IP, dispositivo ou sala) com duração e motivo; o motivo não aparece para quem tenta entrar, e a primeira punição já é o ban.
- Quem é pego por mira automática costuma voltar com outra conta; sem uma etapa intermediária, o moderador hesita em banir e o suspeito continua jogando.

## Escopo
- Trust score por conta (começa em 100): cai só com **confirmação humana** (OG-438) e volta devagar com partidas limpas; histórico visível para o moderador.
- Faixas e o que cada uma faz: normal → aviso (mensagem na entrada) → **sombra** → ban temporário (com prazo) → ban.
- Sombra: a conta entra em salas preenchidas por bots (OG-053) e não percebe — mesmos mapas, chat e placar; a partida não entra no ranking/perfil público.
- Ban temporário mostra motivo e data ao tentar entrar (hoje o join só diz "banned"), expira sozinho e não deixa sujeira ao voltar.
- Recurso: pedido pelo perfil, com a partida e a punição ligadas, caindo na fila de moderação.
- Nada automático a partir do score de suspeita; só de revisão humana (OG-438) ou de N confirmações.
- Termos de uso e política de privacidade (OG-105) citam a sombra e a retenção do histórico.

## Critérios de aceite
- [ ] Conta em sombra entra numa sala casual cheia de bots e não percebe; a partida não conta para ranking nem para marcos.
- [ ] Ban temporário mostra motivo e data ao entrar e expira sozinho no prazo.
- [ ] Pedido de recurso abre na fila de moderação com a punição e a partida ligadas.
- [ ] Trust score só cai por confirmação humana; teste cobre a volta após partidas limpas.

## Notas técnicas
- `bans` já tem `reason`, `expiresAt` e alvo por conta/IP/dispositivo; falta o estado "sombra" e a explicação ao jogador.
- Sombra pode ser um `roomId` privado com bots ou um flag na conta que faz o `join` escolher uma sala assim (`apps/api/src/routes/join.ts`, `rooms.ts`); decidir no refinamento.
- Não vazar a existência da sombra em API pública (perfil, ranking, histórico).

## Notas de implementação
—
