# OG-005 — Licença GPL, créditos e conformidade

| Campo | Valor |
|---|---|
| Épico | E0 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S0 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero o projeto em conformidade com a GPL e com os créditos dos autores originais, para publicar o jogo sem risco legal.

## Contexto e referências no original
- `COPYING` (GPL v2 ou posterior).
- `README.txt` (créditos de programação, temas, fontes, sons, traduções, mapas).
- Mapas de vários autores (`maps/`, `cmaps/`).

## Escopo
- LICENSE GPL-2.0-or-later no monorepo; cabeçalhos SPDX.
- Página/tela de créditos no jogo replicando os créditos originais.
- Link "código-fonte" no rodapé do jogo apontando para o repositório público.
- Avaliar AGPL para o servidor (decisão do PO) e registrar em D-xx.
- Checklist de licenças de dependências (nenhuma incompatível com GPL).

## Critérios de aceite
- [x] LICENSE e NOTICE presentes; créditos completos. _(licença: `COPYING` original, já na raiz; aviso/créditos: `CREDITS.md`)_
- [x] Ferramenta de checagem de licenças no CI (ex. `license-checker`) sem violações.
- [x] Decisão GPL × AGPL registrada na seção 12 do PLAN. _(D-07, com recomendação; aguarda o PO)_

## Notas técnicas
- O nome "Outgun": confirmar uso com os autores, se possível (contato no README original).

## Notas de implementação
- **Licença:** o monorepo usa o `COPYING` original (GPL v2) como arquivo de licença, sem duplicar em `LICENSE`; todos os `package.json` declaram `GPL-2.0-or-later`.
- **Créditos:** `CREDITS.md` (legível) e `packages/content/src/credits.ts` (dados para a UI), transcritos do `README.txt`. E-mails do README omitidos. Testes conferem que as seções e os 18 autores de mapas batem com o `README.txt`.
- **`pnpm check:licenses`** (`tools/license-check/check.mjs`, no `verify` e no CI): (1) dependências de **produção** precisam ter licença da lista compatível com GPL (MIT, ISC, BSD, Apache-2.0, MPL-2.0, etc.; Apache-2.0 é aceita porque o "ou posterior" permite distribuir a obra combinada sob GPLv3); (2) todo arquivo de código em `apps/`, `packages/`, `tools/` precisa do cabeçalho SPDX. Hoje: 0 dependências de produção, 17 arquivos com cabeçalho. Testado com arquivo sem cabeçalho (falha como esperado).
- **Movido para o OG-060:** tela de créditos e link "Código-fonte" no rodapé, que dependem da interface web.
- **Decisões abertas para o PO:** D-07 (GPL × AGPL) e D-08 (uso do nome "Outgun" e contato com os autores).
- **Ajuste técnico:** TypeScript 6 não inclui mais `@types` automaticamente; pacotes cujos testes usam APIs do Node declaram `"types": ["node"]` só no `tsconfig.json` (typecheck), com `"types": []` no build.
- Branch: `og-005-license-credits`.
