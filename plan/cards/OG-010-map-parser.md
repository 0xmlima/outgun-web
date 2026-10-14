# OG-010 — Parser de mapas e validação de todos os mapas

| Campo | Valor |
|---|---|
| Épico | E1 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S1 |
| Status | Concluído |
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
- [x] Todos os 45 mapas de `maps/` e `cmaps/` são lidos sem erro.
- [x] Para cada mapa, o modelo gerado é igual ao do C++ (dump do `Map` via harness) — paredes e coordenadas idênticas.
- [x] Mapas inválidos de teste geram o mesmo veredito do original.

## Notas técnicas
- Encoding dos arquivos: ISO-8859-1.
- Coordenadas após `S` são escaladas para 472×354 — conferir arredondamento.

## Notas de implementação
- **Spec:** `plan/specs/mapas-parser.md`.
- **Código:**
  - `packages/sim/src/geometry/vec.ts` — `Vec`, `dot`, `cross`, com a mesma semântica do original (divisão = multiplicar pelo inverso).
  - `packages/sim/src/map/walls.ts` — `RectWall`, `TriWall`, `CircWall` com construção e `intersectsRect`/`intersectsCirc`. O quique (`tryBounce`) fica para o OG-020.
  - `packages/sim/src/map/map.ts` — `GameMap`, `Room`, `WorldCoords`, `WorldRect`.
  - `packages/content/src/map/` — `parser.ts` (`parseMap`, `parseMapFile`, `decodeMapFile`), `cpp-istream.ts` (leitura com semântica de `istringstream`), `crc16.ts` (`hawkCrc16`).
- **Paridade comprovada:**
  - 65 arquivos (45 mapas distribuídos + 20 de borda) produzem exatamente os mesmos erros, metadados, CRC, bandeiras, spawns, áreas de respawn e paredes que o parser original. Campos trigonométricos dos círculos são comparados com 12 casas, por causa de `sin`/`cos`.
  - As 20.301 consultas de interseção batem exatamente.
  - Prova de sensibilidade: remover o truncamento dos spawns faz 28 testes falharem.
- **Achado: o CRC-16 do HawkNL não é padrão.** É o CRC-CCITT com 16 entradas erradas na tabela (índices 192–207). A tabela foi extraída do binário e embutida, mantendo a mesma identidade de mapa do jogo original.
- **Ferramentas novas:**
  - `pnpm map:check [pastas/arquivos]` valida mapas (45/45 ok).
  - `pnpm map:preview ARQUIVO.txt saída.svg` desenha o mapa a partir do parser (validação visual, referência para o OG-061).
  - Fixtures do oráculo: `maps.cpp`, `walls.cpp`, `crc16.cpp`, `maps-edge/`.
- **Ajustes de base:**
  - TypeScript sem DOM não tem `TextDecoder`; o latin1 é decodificado byte a byte.
  - ESLint passou a aceitar descarte com `...resto` (`ignoreRestSiblings`).
- **Fora deste card:** `MapInfo::infoHash`, usado na lista de mapas, entra no OG-045/066.
- Branch: `og-010-map-parser`.
