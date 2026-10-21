# OG-333 — Pedido de entrada manda o nome "Convidado" para quem está logado

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S35 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como operador, quero que o pedido de entrada mostre o nome de quem está entrando, para ler os pedidos sem confusão.

## Contexto
- Achado do PO em 2026-10-21: `POST /rooms/:id/join` saía com `name: "Convidado"` de jogador logado. O cliente mandava o nome das preferências (padrão "Convidado") sempre; a API ignora o campo com sessão e usa o da conta, então o nome no jogo estava certo.

## Escopo
- `joinName(user, playerName)` no cliente: o nome da conta quando há login; senão o das preferências. Usado na entrada da sala, no "Jogar agora" e na lista de salas.

## Critérios de aceite
- [x] Logado, o pedido de entrada leva o nome da conta; convidado continua com o nome das preferências.
- [ ] PO confere no navegador (aba Rede).

## Notas de implementação
