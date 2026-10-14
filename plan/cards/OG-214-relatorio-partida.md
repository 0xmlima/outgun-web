# OG-214 — Relatório de partida

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S14 |
| Status | Concluído |
| Dependências | [OG-200](OG-200-design-system-v2.md) |
| Regras de negócio | RN-SOC-01, RN-SOC-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero abrir o relatório de uma partida num link compartilhável, com placar, times, números de cada jogador e o replay.

## Contexto
- Substitui o `MatchScreen` (`screens/stats.tsx`, rota `/matches/:id`) e usa `GET /matches/:id` (OG-085, `details` = `save_stats` do original).

## Escopo
- Placar e vencedor, mapa (prévia do `tools/map-preview`), duração, modo e regras.
- Tabela por time com kills, deaths, capturas, assistências, precisão, devoluções; destaque do melhor jogador.
- Linha do tempo das capturas (capturador, assistência, minuto).
- "Assistir replay" (abre o cliente no replay) e links para os perfis.
- No fim da partida o cliente oferece "Ver relatório".

## Critérios de aceite
- [ ] Relatório de uma partida real do beta publicado e conferido com a F4 (depende do deploy da v2 no beta; as colunas da F4 continuam em "Estatísticas detalhadas").

## Notas técnicas
- —

## Notas de implementação
- `screens/MatchReport.tsx` substitui o `MatchScreen` de `stats.tsx`: placar com vencedor, ações (replay, copiar link), mapa + regras, linha do tempo das capturas, tabela por time com "Melhor jogador" (mais frags; desempate capturas, kills, menos mortes) e a F4 completa num `<details>`.
- Prévia do mapa: `MapPreview.tsx` porta o desenho do `tools/map-preview` para SVG em React; mapas gerados na hora (`<Random>`) não estão nos assets e ficam sem prévia.
- "Ver relatório": botão no fim da partida e item no menu Esc → `/rooms/:sala/report?after=` → API nova `GET /rooms/:id/last-match?after=` (índice `matches_room_ended_idx` na migration 0014), com até 10 tentativas de 2 s enquanto o game server envia o resultado.
