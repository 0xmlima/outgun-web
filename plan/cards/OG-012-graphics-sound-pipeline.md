# OG-012 — Pipeline de gráficos e sons

| Campo | Valor |
|---|---|
| Épico | E1 |
| Tipo | Conteúdo |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S1 |
| Status | Backlog |
| Dependências | [OG-001](OG-001-monorepo-setup.md) |
| Regras de negócio | RN-MAP-04 |
| Skills | `outgun-asset-pipeline` |

## História
Como jogador, quero os temas gráficos e sons do original, para reconhecer o jogo.

## Contexto e referências no original
- `graphics/` (Colors, Grass, Grid, Grid 2, Ice, Metal) em PCX.
- `sound/Visa/` WAV + `.txt` de alias (ex. `diedb.txt` → `death2`).
- `graphics/Ice/colours.txt` (esquemas de cores de UI).
- `doc/graphics.html`, `doc/sounds.html`.

## Escopo
- `tools/asset-pipeline`: PCX → PNG (magenta `#FF00FF` vira transparente), WAV → Opus/OGG + AAC/M4A, resolução de aliases de som.
- Atlas de texturas por tema; `manifest.json` com hash de conteúdo.
- Conversão de `colours.txt` em tokens de tema JSON.

## Critérios de aceite
- [ ] Todos os PCX convertidos e conferidos visualmente (página de preview gerada).
- [ ] Todos os sons tocam no Chrome, Firefox e Safari.
- [ ] Pipeline idempotente, rodando no CI; saídas não versionadas no git (geradas no build) ou versionadas via LFS — decidir.

## Notas técnicas
- Grande parte do desenho do jogo é procedural (`graphics.cpp`); os PCX são texturas/overrides de tema.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
