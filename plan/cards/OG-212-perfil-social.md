# OG-212 — Página de perfil social

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S15 |
| Status | Backlog |
| Dependências | [OG-210](OG-210-portal-web.md), [OG-211](OG-211-api-social.md) |
| Regras de negócio | RN-SOC-02, RN-SOC-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero uma página de perfil com meus números, marcos, partidas e companheiros, e navegar pelos perfis dos outros.

## Contexto
- Substitui, no portal, a tela de perfil do cliente (OG-085).

## Escopo
- Cabeçalho: nome, clã, cor favorita/sprite, membro desde, última partida, posição no ranking.
- Números: partidas, vitórias/derrotas/empates, kills, deaths, K/D, capturas, assistências, precisão, tempo de jogo — por modo (Ranked/Casual) e por período.
- Gráfico da evolução do rating na temporada.
- Marcos conquistados (OG-213).
- Partidas recentes (relatório do OG-214 e "Assistir" o replay).
- Companheiros e rivais frequentes, com link para os perfis.

## Critérios de aceite
- [ ] Números batem com a API (teste de contrato) e com a tela F4 da partida.
- [ ] Navegação perfil → companheiro → partida → perfil só com links.
- [ ] Prints desktop e celular.

## Notas técnicas
- —

## Notas de implementação
(preenchido durante a execução)
