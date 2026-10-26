# OG-433 — "Enviar feedback" na barra de cima

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | — (2.46.1) |
| Status | Em revisão |
| Dependências | OG-429 |
| Regras de negócio | D-80 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero achar "Enviar feedback" fora da partida, para relatar um bug sem precisar entrar numa sala.

## Contexto
- Pedido do PO em 2026-10-26: na 2.46.0 a tela de feedback só abria pelo menu da partida (Esc).

## Critérios de aceite
- [x] A barra de cima (e o rodapé da tela inicial, que usa os mesmos links) mostra "Enviar feedback" logo depois de "Opções", abrindo no tipo Bug.
- [x] No celular o link também aparece (a tela de feedback é do portal, D-80).

## Notas de implementação
- `useNavLinks` (`app/Shell.tsx`) ganhou `/feedback?tipo=bug`; o filtro do celular passou a ignorar a query ao conferir as rotas do portal. Sem conta, a tela manda para o login, como antes.
