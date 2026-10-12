# OG-005 — Licença GPL, créditos e conformidade

| Campo | Valor |
|---|---|
| Épico | E0 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S0 |
| Status | Pronto |
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
- [ ] LICENSE e NOTICE presentes; créditos completos.
- [ ] Ferramenta de checagem de licenças no CI (ex. `license-checker`) sem violações.
- [ ] Decisão GPL × AGPL registrada na seção 12 do PLAN.

## Notas técnicas
- O nome "Outgun": confirmar uso com os autores, se possível (contato no README original).

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
