---
name: outgun-asset-pipeline
description: Converte os assets do Outgun original (mapas .txt, gráficos PCX, sons WAV, fontes Allegro .dat, idiomas) para formatos web e gera o manifesto de assets. Use nos cards do épico E1 (OG-010 a OG-014), ao adicionar um tema gráfico, tema de som, fonte, idioma ou mapa, ou quando um asset aparecer errado no cliente web.
---

# Outgun — pipeline de assets

Os originais ficam intocados; o pipeline (`tools/asset-pipeline/`) lê da raiz do repositório original e escreve em `apps/web/public/assets/` (gerado, com hash de conteúdo) + `manifest.json`. O pipeline deve ser **idempotente** e rodar no CI.

## Inventário
| Origem | Formato | Destino |
|---|---|---|
| `maps/*.txt`, `cmaps/*.txt` | texto (spec `doc/maps.html`), ISO-8859-1 | copiar `.txt` + JSON compilado pelo parser de `packages/content` |
| `mapgen/*.txt` | blocos de sala do gerador | JSON |
| `graphics/<tema>/*.pcx` | PCX 8 ou 24 bits | PNG (e WebP) com alpha, atlas por tema |
| `graphics/<tema>/colours.txt` | `nome RRGGBB` por linha | tokens JSON |
| `sound/<tema>/*.wav` | PCM 16 bits mono 22,05 kHz | `.ogg` (Opus) + `.m4a` (AAC) |
| `sound/<tema>/*.txt` | **alias**: conteúdo = nome de outro sample (ex. `diedb.txt` → `death2`) | resolver para o arquivo real no manifesto |
| `fonts/*.dat` | datafile Allegro compactado (magic `slh.ALL`, LZSS) | BMFont `.fnt` + `.png` |
| `languages/*.txt` | uma frase por linha não comentada; chave = linha correspondente em `en.txt`; placeholders `$1..$n` | JSON i18next, placeholders `{{1}}` |

## Regras de conversão
- **Transparência:** no Allegro, magenta puro `#FF00FF` é a cor de máscara. Converter para alpha 0. Verifique também PCX de 8 bits com paleta (o índice da paleta que for magenta).
- **Sprites `*_team.pcx`, `*_personal.pcx`, `*_alpha.pcx`** (ex. `player_team`, `player_personal`, `dead_alpha`) são **mapas de alpha de 8 bits** usados para pintar a cor do time/pessoal por cima do sprite base (`Graphics::overlayColor`, `scale_alpha_sprite` em `src/graphics.cpp:2926-2960`). Exportar como máscara em escala de cinza (não como imagem final) e aplicar o tint no cliente (Pixi `tint`/filtro).
- **Texturas de chão e parede** precisam ter lados potência de 2 e são repetidas (tile) — `graphics.cpp:2872-2905`.
- **Arquivos ausentes num tema** caem no desenho procedural do cliente (o original faz o mesmo: `graphics.cpp`). O manifesto lista só o que existe.
- **Encoding:** ler textos como `latin1`, escrever UTF-8.
- **Fontes:** preferir exportar glifos com o utilitário `dat` do Allegro dentro do container do OG-002 (`tools/parity/docker`); só escrever unpacker LZSS próprio se o container não servir. Conferir caracteres acentuados (pt-BR, fi, it).
- **Mapas:** nunca "corrigir" um mapa na conversão; erro de mapa é bug do parser ou mapa inválido (RN-MAP-05).

## Ferramentas
- Imagens: `sharp` (Node) ou ImageMagick (`magick in.pcx -transparent '#FF00FF' out.png`).
- Áudio: `ffmpeg -i in.wav -c:a libopus -b:a 48k out.ogg` e `ffmpeg -i in.wav -c:a aac -b:a 64k out.m4a`.
- Textos: Node com `TextDecoder('latin1')`.

## Verificação
- Gerar `tools/asset-pipeline/preview/index.html` com todas as imagens sobre fundo xadrez, todas as fontes renderizando um pangrama com acentos e botões para todos os sons.
- Teste: todo asset referenciado pelo código do cliente existe no manifesto; todo alias de som resolve.
- Comparar visualmente com screenshots do cliente original (OG-002) quando houver dúvida.

## Créditos
Ao adicionar ou converter um tema/mapa/fonte, manter o autor nos metadados do manifesto e na tela de créditos (OG-005).
