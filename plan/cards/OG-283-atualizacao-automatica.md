# OG-283 — Telas do portal paradas: atualização automática mais frequente

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Correção |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S21 |
| Status | Backlog |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver a vida do jogo acontecendo (jogadores online, salas, ranking) sem recarregar a página, para o Outgun parecer online.

## Contexto
- Achado do PO no beta (2026-10-15): é preciso recarregar a página para ver, por exemplo, os jogadores online mudarem.
- A tela inicial já consulta sozinha, mas a cada 30 s (`POLL_MS` em `apps/web/src/screens/home-panels.tsx`, `usePolled`), e pausa com a aba escondida. O lobby consulta a cada 3 s (`REFRESH_MS`) e o heartbeat do game server é de 3 s. Perfil, ranking, clã e hall da fama carregam uma vez só.

## Escopo
- "Agora no Outgun" (`/rooms`) a cada 3–5 s, alinhado ao lobby; ao voltar para a aba, recarrega na hora (já existe).
- Ranking, perfil, clã e hall da fama: recarregam ao voltar para a aba e a cada ~60 s, sem piscar "Carregando..." (troca o dado no lugar).
- Sem mudança na API. Push em tempo real fica no OG-284.

## Critérios de aceite
- [ ] (PO) Com a tela inicial aberta, alguém entra numa sala: o total de online muda em até ~5 s, sem recarregar.
- [ ] (PO) Ranking/perfil se atualizam ao voltar para a aba, sem piscar.
- [ ] Teste do `usePolled` (intervalo por tela e pausa com a aba escondida).

## Notas de implementação
(preenchido durante a execução)
