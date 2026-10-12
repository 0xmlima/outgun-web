# OG-010 — Parser de mapas e validação de todos os mapas

| Campo | Valor |
|---|---|
| Épico | E1 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S1 |
| Status | Backlog |
| Dependências | [OG-001](OG-001-monorepo-setup.md) |
| Regras de negócio | RN-MAP-01, RN-MAP-03, RN-MAP-04, RN-MAP-05 |
| Skills | `outgun-re-spec`, `outgun-parity-harness`, `outgun-asset-pipeline` |

## História
Como jogador, quero jogar em todos os mapas clássicos, para ter a mesma variedade do original.

## Contexto e referências no original
- `Map::parse_file`/`parse_line` (`world.cpp:397-775`).
- Spec em `doc/maps.html` e tutorial `doc/map-tutorial.html`.
- Classes `RectWall`, `TriWall`, `CircWall`, `Room` (`world.h:96-195`).
- `src/tools/mapconv.cpp`.

## Escopo
- `packages/content/map`: parser `.txt` → modelo tipado (salas, paredes, chãos, texturas, bandeiras, spawns, respawn areas, título, autor).
- Suporte a `S`, `R`, `:label`/`X`, `V` e comandos desconhecidos ignorados como no original.
- Mensagens de erro com linha do arquivo.
- Hash do mapa (equivalente a `infoHash`) para cache no cliente.
- CLI `pnpm map:check` que valida `maps/` e `cmaps/`.

## Critérios de aceite
- [ ] Todos os 45 mapas de `maps/` e `cmaps/` são lidos sem erro.
- [ ] Para cada mapa, o modelo gerado é igual ao do C++ (dump do `Map` via harness) — paredes e coordenadas idênticas.
- [ ] Mapas inválidos de teste geram o mesmo veredito do original.

## Notas técnicas
- Encoding dos arquivos: ISO-8859-1.
- Coordenadas após `S` são escaladas para 472×354 — conferir arredondamento.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
