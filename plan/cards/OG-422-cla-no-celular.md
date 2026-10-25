# OG-422 — Clã no celular: perfil, estatísticas e ranking de clãs

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S45 |
| Status | Em revisão |
| Dependências | OG-418 |
| Regras de negócio | RN-UI-08 |
| Skills | `outgun-card-workflow` |

## História
Como membro de clã no celular, quero ver o perfil e as estatísticas do clã, para acompanhar o time.

## Contexto
- Pedido do PO em 2026-10-25 (S45): o celular volta, mas sem a partida — estatísticas, perfis, relatórios em PDF e moderação, tudo no visual retrô da S44 (OG-416). D-80 substitui a D-50.
- `screens/clans.tsx` e `clan-stats.tsx` (OG-272 a OG-274, OG-407): lista, perfil do clã, membros, estatísticas, cores e ranking de clãs.

## Escopo
- Lista de clãs e ranking de clãs em lista/cartões.
- Perfil do clã em uma coluna: tag com as cores, membros com papel, estatísticas, confrontos e partidas recentes.
- Gestão do clã pelo líder (convidar, aceitar, expulsar, cores) funcionando no toque; criar clã também.

## Critérios de aceite
- [x] Lista, ranking e perfil do clã em 360 px com as mesmas informações do desktop.
- [x] Ações do líder funcionam no celular.

## Notas técnicas
- Só layout e CSS.

## Notas de implementação
- Lista, perfil, estatísticas, convites (`/clans/inbox`) e criação do clã já eram formulários e tabelas do design system: no celular rolam dentro do painel (OG-418). Colunas secundárias com `hideOnPhone`: "Fundado", "Desde", "Tempo de jogo" e, no ranking de clãs (aba de `Players.tsx`), "Partidas" e "Saldo de capturas".
- Ações do líder (promover, passar a liderança, remover) empilhadas dentro da linha da tabela no celular.
