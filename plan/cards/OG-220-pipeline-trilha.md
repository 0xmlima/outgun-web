# OG-220 — Pipeline da trilha sonora

| Campo | Valor |
|---|---|
| Épico | E10 |
| Tipo | Conteúdo |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S13 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | RN-MUS-01, RN-MUS-05 |
| Skills | `outgun-card-workflow`, `outgun-asset-pipeline` |

## História
Como jogador, quero que as músicas carreguem rápido e sem atrasar a entrada no jogo.

## Contexto
- `songs/` na raiz: 10 faixas MP3 (~26 MB, 57–182 s), de autoria de **Thiago Vasconcellos** (D-38); metadados do Suno já removidos em 2026-10-14. `Outgun epic.mp3` é o tema do menu.

## Escopo
- Versionar `songs/` como fonte (como os assets de `_legacy/`).
- `pnpm assets` gera as faixas para a web (formato/bitrate decididos no card; ex.: MP3 ou AAC ~128 kbps) com hash no nome e entrada `music` no manifesto: id, título, papel (`menu`/`match`), duração, créditos.
- Crédito "Música: Thiago Vasconcellos" na tela de créditos, em `CREDITS.md` e no manifesto (D-38).

## Critérios de aceite
- [x] Manifesto lista 1 faixa de menu e 9 de partida; nenhuma música entra no carregamento inicial (orçamento de 5 MB do PLAN 1.2 mantido).
- [x] Créditos das faixas visíveis na tela de créditos.

## Notas técnicas
- `Outgun 2` e `Outgun 2-2` (etc.) são faixas distintas com o mesmo título nos metadados: o id vem do nome do arquivo.

## Notas de implementação
- **Formato (decisão do card):** as faixas vão como estão: MP3 de ~180–210 kbps, 48 kHz, estéreo (1,2–4,2 MB cada, 23 MB no total). Sem recodificar: o cliente baixa uma faixa por vez, sob demanda; MP3 toca em todos os navegadores; não há perda de uma segunda compressão e o pipeline continua sem depender do ffmpeg (CI e `deploy/Dockerfile` rodam `pnpm assets` sem ele). Se o tráfego pesar no celular, recodificar para ~128 kbps é uma troca local em `tools/asset-pipeline/src/music.ts`.
- `songs/` versionada na raiz (fonte, como `_legacy/`). `pnpm assets` copia cada faixa para `assets/music/<id>.<hash>.mp3` e acrescenta `music` ao manifesto: `id` (do nome do arquivo: `Outgun 2` e `Outgun 2-2` ficam distintas), `title` ("Outgun Epic"), `role` (`menu` só para `outgun-epic`, `match` para as demais), `duration` (segundos, lida dos quadros MP3 por `mp3Duration`, igual ao ffprobe com ±0,1 s) e `credit`. A prévia (`preview.html`) ganhou a seção de música.
- **Carregamento inicial:** só o manifesto (JSON) conhece as faixas; nada de música é baixado até o OG-221 tocar (RN-MUS-05).
- **Créditos:** grupo "Music — Thiago Vasconcellos" em `WEB_CREDITS` (tela de créditos), seção "Música" em `CREDITS.md` e `credit` em cada faixa do manifesto (D-38).
- **Pendente do PO:** a licença das faixas para redistribuição fora do jogo não foi definida na D-38; o `CREDITS.md` diz só que são distribuídas com o jogo com autorização do autor.
- Testes: `tools/asset-pipeline/src/music.test.ts` (id, título, duração das 10 faixas, quadro com lixo e ID3) e o build completo em `pipeline.test.ts` (1 faixa de menu + 9 de partida, arquivo idêntico ao original).
- Cache: o Caddy trata os assets do jogo sem hash do Vite com 5 min + revalidação (ETag/304); as faixas não são baixadas de novo, só revalidadas.
