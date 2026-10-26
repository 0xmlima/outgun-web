# OG-430 — Abrir a issue no GitHub pelo painel

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S46 |
| Status | Concluído |
| Dependências | OG-429 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero transformar um relato de bug do site numa issue do GitHub com um clique, para ele entrar no fluxo de cards sem retrabalho.

## Contexto
- Decisão do PO em 2026-10-26: as issues saem com a conta do PO (token *fine-grained* só do repositório `outgun-web`, permissão Issues leitura e escrita, guardado como segredo do servidor). O repositório é público desde 2026-10-26.
- Triagem antes de publicar: evita spam e duplicatas e decide o que vai a público.

## Escopo
- Botão "Abrir issue" no feedback do tipo bug (aba Feedback): mostra o título e o corpo no formato do modelo para revisar, e cria a issue com os labels `bug`, `triagem` e `gravidade:<nível>`.
- O feedback guarda o número e o link da issue; o botão vira o link. Ação auditada.
- Sem token configurado, o botão some e a API responde 503.
- O corpo leva o apelido (público no jogo), versão, navegador, sala e mapa; nada de e-mail, conta ou IP.

## Critérios de aceite
- [x] Com o GitHub simulado no teste, a API cria a issue com título, corpo e labels certos e grava o número.
- [x] Segunda tentativa no mesmo feedback devolve a issue existente (não duplica).
- [x] Sem token: 503 e o botão não aparece.

## Notas técnicas
- Variáveis `GITHUB_ISSUES_TOKEN` e `GITHUB_ISSUES_REPO` (padrão `thiagovasconcellos/outgun-web`) no `.env` do servidor; documentar em `deploy/vps/README.md`.

## Notas de implementação
- `apps/api/src/github.ts`: cliente REST (`IssueTracker`, injetável em `AppDeps.issues`) e `issueDraft` no formato do modelo; labels `bug`, `triagem`, `gravidade:*`. Rotas `GET/POST /admin/feedback/:id/issue` (prévia e criação, auditada como `feedback_issue`; relato `new` passa a `confirmed`).
- Painel: coluna Issue com o link ou o botão; o diálogo mostra a prévia, deixa editar o título e avisa que o repositório é público.
- **Pendente do PO:** criar o token e pôr `GITHUB_ISSUES_TOKEN` no `/opt/outgun/.env` (passo a passo em `deploy/vps/README.md`).
