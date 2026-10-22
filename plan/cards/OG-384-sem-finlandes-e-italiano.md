# OG-384 — Tirar os idiomas finlandês e italiano

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S40 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | D-76 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero escolher só entre os idiomas que o jogo mantém de verdade (português e inglês), sem traduções antigas e incompletas.

## Contexto
- Pedido do PO em 2026-10-22: finlandês (suomi) e italiano são legado do original, para uma parcela muito pequena da comunidade de 20 anos atrás. Os textos novos da v2 nunca foram traduzidos para eles (caíam no inglês).

## Escopo
- `LOCALES` = `en`, `pt-BR`; `detectLocale` não escolhe mais `fi`/`it` (cai no inglês); catálogos regerados só com os dois; o conversor (`tools/i18n-convert`) deixa de ler `fi`/`it`.
- Quem tinha `fi`/`it` salvo nas opções (navegador ou conta) cai no idioma detectado, sem erro.
- Fora do escopo: créditos dos tradutores do original (ficam, são história) e os nomes de bot finlandeses (`bot_name_lang fi`), que entram na revisão do OG-385.

## Critérios de aceite
- [x] Opções › Idioma lista só English e Português (Brasil).
- [x] Preferência antiga `fi`/`it` abre o jogo no idioma do navegador (pt-BR ou inglês).

## Notas de implementação
- Os arquivos de `_legacy/languages/` continuam lá (referência); só não são mais convertidos.
- A página da Steam lista idiomas no Steamworks: tirar finlandês/italiano lá é manual (PO).
