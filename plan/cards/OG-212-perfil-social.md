# OG-212 — Página de perfil social

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S15 |
| Status | Concluído |
| Dependências | [OG-200](OG-200-design-system-v2.md), [OG-211](OG-211-api-social.md) |
| Regras de negócio | RN-SOC-01, RN-SOC-02, RN-SOC-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero uma página de perfil com meus números, marcos, partidas e companheiros, e navegar pelos perfis dos outros.

## Contexto
- Substitui a tela de perfil atual do cliente (`ProfileScreen` em `screens/stats.tsx`, OG-085), na mesma rota `/players/:nome`, como página web com rolagem (não menu).

## Escopo
- Cabeçalho: nome, clã, cor favorita/sprite, membro desde, última partida, posição no ranking.
- Números: partidas, vitórias/derrotas/empates, kills, deaths, K/D, capturas, assistências, precisão, tempo de jogo — por modo (Ranked/Casual) e por período.
- Gráfico da evolução do rating na temporada.
- Marcos conquistados (OG-213).
- Partidas recentes (relatório do OG-214 e "Assistir" o replay).
- Companheiros e rivais frequentes, com link para os perfis.
- Atalhos: "Meu perfil" no menu/conta; no placar (Tab/F4) o nome do jogador abre o perfil.

## Critérios de aceite
- [x] Números batem com a API (teste de contrato) e com a tela F4 da partida.
- [x] Navegação perfil → companheiro → partida → perfil só com links.
- [x] Prints desktop e celular.

## Notas técnicas
- —

## Notas de implementação
- `screens/Profile.tsx` (página com rolagem; Tabs Casual/Ranqueado, atividade 7/30 dias/sempre de `/progress`, gráfico SVG do rating com cursor, marcos, partidas com "Assistir", companheiros/rivais/clã). `/players/:nome` ganhou `favoriteColors`, `lastMatchAt` e `milestones`; o histórico ganhou `replayUrl`. Escondidos (D-39) aparecem como "privado".
- Atalhos: "Meu perfil" e "Jogadores" no menu principal, "Jogadores" no topo; no F4 o nome de quem entrou com conta abre o perfil numa aba nova (a partida continua). Conferido numa partida com bots (F4 igual ao anterior, 59 FPS).
- Prints conferidos pelo agente (desktop 1280 e celular 390) com 60 partidas sintéticas.
