# OG-216 — Ligações entre o cliente e o portal

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Won't (v2) |
| Estimativa | 2 pts |
| Sprint | — |
| Status | Cancelado |
| Dependências | [OG-212](OG-212-perfil-social.md), [OG-214](OG-214-relatorio-partida.md) |
| Regras de negócio | RN-SOC-01 |
| Skills | `outgun-card-workflow` |

## História
> Cancelado em 2026-10-14 junto com o OG-210: sem portal, os atalhos foram para o OG-212 e o OG-214.

Como jogador, quero ir do jogo para o meu perfil ou para o relatório da partida com um clique.

## Contexto
- Telas de perfil/partida/ranking do cliente (OG-085) e fim de partida.

## Escopo
- Menu e conta: "Meu perfil" abre o portal (nova aba); fim de partida: "Ver relatório"; Tab/F4: nome do jogador leva ao perfil.
- Telas antigas de estatísticas do cliente saem (ou redirecionam para o portal).

## Critérios de aceite
- [ ] Nenhum link quebrado (E2E); rotas antigas `/players/:nome`, `/matches/:id`, `/ranking` redirecionam.

## Notas técnicas
- —

## Notas de implementação
(preenchido durante a execução)
