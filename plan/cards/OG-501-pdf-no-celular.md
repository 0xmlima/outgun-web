# OG-501 — Baixar PDF no celular

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S51 |
| Status | Concluído |
| Dependências | OG-425, OG-426 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador no celular, quero baixar o PDF do relatório da partida ou da série, para guardar e mandar no grupo.

## Contexto
- PO (2026-10-28): "Baixar PDF" não funciona no app do celular; no computador funciona (conferido em produção, 2.50.2, partida Casual e Ranked). O OG-425 tinha deixado "falta conferir no iPhone/Android".
- O download por `<a download>` com blob não funciona em vários navegadores de celular, sobretudo no app instalado na tela inicial do iPhone.

## Escopo
- No celular (`isPhone`) com Web Share de arquivos: o PDF vai pela folha de compartilhar do sistema. Se o toque expirou enquanto o PDF era montado (`NotAllowedError`), o botão vira "Abrir o PDF" e o próximo toque compartilha. Computador e app desktop: download como antes.

## Critérios de aceite
- [x] Relatório da partida e da série: no celular abre a folha de compartilhar; fechar a folha volta ao botão normal; no computador baixa o arquivo.
- [x] Conferido pelo PO no celular dele (aprovado com a sprint).

## Notas de implementação
- `report-pdf.ts`: `matchPdf`/`seriesPdf` devolvem um `File`; `savePdf(file)` baixa. `PdfButton` (`MatchReport.tsx`) escolhe entre compartilhar e baixar.
- Sem Web Share de arquivos (navegador antigo), cai no download como antes.
