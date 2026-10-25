# OG-419 — Tela inicial do celular (portal)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S45 |
| Status | Em revisão |
| Dependências | OG-418 |
| Regras de negócio | RN-UI-08, D-80 |
| Skills | `outgun-card-workflow` |

## História
Como jogador no celular, quero uma tela inicial com o que dá para fazer ali, para não cair num botão de jogar que não funciona.

## Contexto
- Pedido do PO em 2026-10-25 (S45): o celular volta, mas sem a partida — estatísticas, perfis, relatórios em PDF e moderação, tudo no visual retrô da S44 (OG-416). D-80 substitui a D-50.
- A tela inicial da S44 (`home-start.tsx`) é toda voltada a entrar na partida com o time escolhido.

## Escopo
- Tela inicial própria no celular: atalhos para meu perfil, meu clã, ranking (leaderboard do mês), hall da fama, jogadores, clãs e, para moderadores, moderação.
- Minhas últimas partidas (com link para o relatório) e quem está jogando agora (salas e lobby Ranked só para leitura, pelo portal ao vivo).
- Faixa curta e fixa: "para jogar, abra no computador" (com o link da Steam/download).
- Convidado vê ranking, jogadores, clãs e o convite para entrar.

## Critérios de aceite
- [x] Celular abre na tela nova; desktop continua com a tela da S44.
- [x] Salas ao vivo só para leitura, sem entrar.
- [x] Atalho de moderação só para moderadores e admins.

## Notas técnicas
- Reaproveitar `home-panels.tsx` e o tópico ao vivo das salas (`app/live.ts`).

## Notas de implementação
- `screens/home-phone.tsx` (`PhoneHome`), escolhida no `HomeScreen` com `isPhone()`; no celular o início usa a barra comum (com a gaveta). Reaproveita a ficha da S44 (clã, ranking, marcos), as últimas partidas, `NowPlaying` (novo `readOnly`: sem link para a sala, até 5 salas) e `MonthRanking` (sem o botão de salas).
- Faixa "para jogar, abra no computador" + selo da Steam; "Jogar no computador" (/download) some dos rodapés no celular.
