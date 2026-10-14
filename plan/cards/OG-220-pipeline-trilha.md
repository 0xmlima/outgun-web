# OG-220 — Pipeline da trilha sonora

| Campo | Valor |
|---|---|
| Épico | E10 |
| Tipo | Conteúdo |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S13 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | RN-MUS-01, RN-MUS-05 |
| Skills | `outgun-card-workflow`, `outgun-asset-pipeline` |

## História
Como jogador, quero que as músicas carreguem rápido e sem atrasar a entrada no jogo.

## Contexto
- `songs/` na raiz: 10 faixas MP3 (~26 MB, 57–182 s; metadados: artista "ozzylords", feitas com Suno). `Outgun epic.mp3` é o tema do menu.

## Escopo
- Versionar `songs/` como fonte (como os assets de `_legacy/`).
- `pnpm assets` gera as faixas para a web (formato/bitrate decididos no card; ex.: MP3 ou AAC ~128 kbps) com hash no nome e entrada `music` no manifesto: id, título, papel (`menu`/`match`), duração, créditos.
- Créditos e licença das músicas na tela de créditos e em `CREDITS.md` (D-38).

## Critérios de aceite
- [ ] Manifesto lista 1 faixa de menu e 9 de partida; nenhuma música entra no carregamento inicial (orçamento de 5 MB do PLAN 1.2 mantido).
- [ ] `pnpm check:licenses` reconhece a licença das faixas.

## Notas técnicas
- `Outgun 2` e `Outgun 2-2` (etc.) são faixas distintas com o mesmo título nos metadados: o id vem do nome do arquivo.

## Notas de implementação
(preenchido durante a execução)
