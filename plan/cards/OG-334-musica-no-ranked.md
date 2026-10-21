# OG-334 — Música também nas partidas Ranked

| Campo | Valor |
|---|---|
| Épico | E10 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S35 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-MUS-02, D-37 |
| Skills | `outgun-card-workflow` |

## História
Como jogador do Ranked, quero ouvir a trilha durante a partida, como no Casual.

## Contexto
- Pedido da comunidade em 2026-10-21. A D-37 (2026-10-14) deixava o Ranked sem música; o PO revê a decisão e trata como bug.

## Escopo
- Partida Ranked toca a playlist das partidas (`useMusicMode('match')`); replay segue sem música. Quem não quiser desliga nas Opções (RN-MUS-04).
- D-37 atualizada.

## Critérios de aceite
- [x] Sala Ranked toca a playlist; até o servidor dizer o modo, silêncio; replay sem música.
- [ ] PO confere numa ranqueada.

## Notas de implementação
