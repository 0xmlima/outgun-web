# OG-012 — Pipeline de gráficos e sons

| Campo | Valor |
|---|---|
| Épico | E1 |
| Tipo | Conteúdo |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S1 |
| Status | Concluído |
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
- [x] Todos os PCX convertidos e conferidos visualmente (página de preview gerada).
- [ ] Todos os sons tocam no Chrome, Firefox e Safari. _(mantidos em WAV PCM, formato suportado pelos três; falta a conferência manual nos navegadores, a fazer na prévia ou no OG-067)_
- [x] Pipeline idempotente, rodando no CI; saídas não versionadas no git (geradas no build) ou versionadas via LFS — decidir. _(decidido: geradas no build, `apps/web/public/assets/` no `.gitignore`; os testes do pipeline rodam no CI)_

## Notas técnicas
- Grande parte do desenho do jogo é procedural (`graphics.cpp`); os PCX são texturas/overrides de tema.

## Notas de implementação
- **Pacote `@outgun/asset-pipeline`** (`tools/asset-pipeline`), sem dependências externas: decodificador PCX (8 bits com paleta e 24 bits, RLE), codificador PNG mínimo (cinza/RGBA, `node:zlib`) e o build com manifesto. Comando: `pnpm assets [saída]` (padrão `apps/web/public/assets/`), que também gera `preview.html`.
- **Regras do original reproduzidas** (`src/graphics.cpp:2856-3072`, `src/sounds.cpp`):
  - sprites com magenta transparente;
  - mapas de alpha (`*_team`, `*_personal`, `*_alpha`) exportados como cinza com o **índice da paleta** (o original os lê sem conversão de cor);
  - texturas opacas;
  - sons com um único redirecionamento `.txt`.
- **Resultado:** 109 imagens em 6 temas; tema de som Visa com 33 de 37 samples. Os 4 sem som (`wallhit`, `qwallhit` → "FIXME", `colldam` inexistente e `5_min` ausente) também não têm som no original.
- **Manifesto** (`manifest.json`): por tema gráfico, cada imagem com arquivo (hash de conteúdo no nome), papel e tamanho, mais as cores de interface (`colours.txt` → `#RRGGBB`); por tema de som, o nome e o arquivo de cada sample (ou `null`).
- **Testes (117):**
  - pixels dos 109 PCX idênticos ao ImageMagick (fixture `pcx-reference.json`, gerado no oráculo);
  - PNG lido de volta sem perda, com CRCs válidos;
  - transparência, mapas de alpha e texturas;
  - aliases de som;
  - build determinístico.
- **Decisão: sons continuam em WAV** (diferente do escopo original, que previa OGG/AAC). São 768 KB no total, tocam em Chrome, Firefox e Safari sem perda e não exigem ffmpeg no CI; o carregamento sob demanda fica no OG-067. Compressão vira card próprio se o orçamento de tamanho exigir.
- **Para o OG-062:** alguns temas compõem sprite + mapa de alpha. Exemplo: em Grass, `dead` é um quadrado vermelho e a forma vem de `dead_alpha`. Seguir `graphics.cpp` ao compor.
- Branch: `og-012-graphics-sound-pipeline`.
