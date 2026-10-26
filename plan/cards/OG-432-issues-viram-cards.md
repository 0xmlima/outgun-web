# OG-432 — Issues de bug viram cards

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S46 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero carregar as issues de bug e transformá-las em cards de uma sprint de correções, e fechá-las com a versão quando a sprint for aprovada.

## Escopo
- Formulário de bug do GitHub (`.github/ISSUE_TEMPLATE/bug.yml`), com os campos do modelo, e `config.yml` apontando o formulário do site para quem não tem GitHub.
- Labels: `triagem`, `card-criado`, `gravidade:critico|alto|medio|baixo`.
- `tools/dev/issues.mjs import --sprint SNN`: cada issue aberta com `bug` + `triagem` vira card (template 8.7, campo Issue, prioridade pela gravidade), linha na seção 10 e na 9.2; comenta o ID do card na issue e troca `triagem` por `card-criado`. `--dry-run` só mostra.
- `tools/dev/issues.mjs close --version X.Y.Z`: fecha as issues dos cards `Concluído` com comentário "Corrigido na X.Y.Z" e milestone `X.Y.Z`.
- Passo do fechamento de sprint na skill `outgun-card-workflow`.

## Critérios de aceite
- [x] `import --dry-run` lista os cards que criaria a partir das issues abertas.
- [x] `close` só fecha issue cujo card está `Concluído`.

## Notas de implementação
- `.github/ISSUE_TEMPLATE/bug.yml` com os títulos iguais aos das issues do painel (`github.ts`), para `tools/dev/issues.mjs` ler os dois; também lê o modelo em Markdown com caixas (como na issue #6). `config.yml` aponta o formulário do site e o relato privado de segurança.
- Labels criados no repositório (`triagem`, `card-criado`, `gravidade:*`); a issue #6 ganhou `bug`, `card-criado` e `gravidade:critico` e o comentário com o OG-428.
- Passos de import e close na skill `outgun-card-workflow`. O import não mexe no total de pontos (fica para o refinamento).
