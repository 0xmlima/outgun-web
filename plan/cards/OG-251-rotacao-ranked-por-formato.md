# OG-251 — Rotação de mapas do Ranked por formato no painel admin

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S17 |
| Status | Concluído |
| Dependências | [OG-250](OG-250-formatos-series-ranked.md) |
| Regras de negócio | RN-RKL-04 |
| Skills | `outgun-card-workflow` |

## História
Como admin, quero escolher quais mapas entram na rotação Ranked de cada formato, para que mapas grandes fiquem no 5x5 e não no 3x3 (ex.: "The Blunt" no 4x4 e fora do 3x3).

## Contexto
- `map_rotations` hoje é uma lista por modo (D-34); chega aos game servers pela resposta do heartbeat.

## Escopo
- Rotação Ranked por formato (`ranked:3x3`, `ranked:4x4`, `ranked:5x5`), versionada e auditada como hoje.
- Painel admin: tabela mapa × formato com caixas de marcar; um formato não pode ficar sem mapas.
- Migração: a rotação Ranked atual vira a inicial dos três formatos.

## Critérios de aceite
- [x] Mudança no painel chega às salas no próximo voto de mapa, sem reiniciar o servidor.
- [x] Testes da validação (formato vazio recusado, mapa inexistente recusado) e da auditoria.

## Notas técnicas
- O voto de mapa (OG-254) oferece só os mapas da rotação do formato da sala.

## Notas de implementação
- `map_rotations.mode` virou `key` (`casual`, `ranked`, `ranked:3x3/4x4/5x5`, `ROTATION_KEYS` em `@outgun/settings`); a migration copia a `ranked` atual para os três formatos. A `ranked` sem formato fica só para a sala Ranked antiga (sem UI; some com o OG-252).
- Mapa inexistente: os game servers mandam no heartbeat os mapas da pasta (`game_servers.maps`); a API recusa o que nenhum servidor tem (`random_map ...` sempre aceito). Sem nenhum servidor informado, não dá para conferir e a validação é pulada (o servidor já ignora mapa desconhecido).
- Painel: Casual continua em texto; Ranked é tabela mapa × formato. Mudança vale no próximo voto de todas as salas Ranked do formato (sempre na rotação oficial) e nas salas novas.
