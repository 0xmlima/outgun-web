# OG-429 — Formulário de bug no site

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S46 |
| Status | Concluído |
| Dependências | OG-106, OG-203 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador sem conta no GitHub, quero relatar um bug pelo próprio site, num formulário guiado, para que ele chegue ao time do jeito que eles precisam.

## Contexto
- Pedido do PO em 2026-10-26: muitos membros da comunidade não têm GitHub. O modelo de issue de bug (resumo, área, passos, esperado, obtido, frequência, gravidade, evidências, contorno) passa a ser o formulário do tipo "Bug" da tela de feedback (`FeedbackScreen.tsx`, OG-106/OG-203).

## Escopo
- Tipo "Bug" na tela de feedback mostra os campos do modelo: área (lista), resumo, passos, o que esperava, o que aconteceu, frequência, gravidade, evidências (link da partida, print, vídeo) e contorno. Notas de fidelidade e geral só nos outros tipos.
- Preenchido sozinho: versão, navegador e sistema (app da Steam/desktop reconhecido), data e hora com fuso, sala, mapa e o link da última partida do jogador.
- A API guarda os campos estruturados no feedback (migração nova) e valida obrigatórios (resumo e o que aconteceu).
- No painel (aba Feedback), o bug aparece com os campos organizados.

## Critérios de aceite
- [x] Relato de bug com os campos obrigatórios grava e aparece no painel com o contexto automático.
- [x] Sem resumo ou sem "o que aconteceu", a API recusa (teste).
- [x] Os outros tipos de feedback continuam iguais.

## Notas técnicas
- `apps/api/src/routes/feedback.ts`, `apps/api/src/db/schema.ts`, migração `0042`; `apps/web/src/screens/FeedbackScreen.tsx`, aba Feedback do `AdminScreen.tsx`.

## Notas de implementação
- Tipo "Bug" troca as notas pelos campos do modelo (`app/bug-report.ts`); `/feedback?tipo=bug` já abre nele. Contexto automático: versão, cliente (navegador ou app desktop/Steam), sistema, computador/celular, hora com fuso; a API junta a última partida do jogador (`context.match`).
- Migração `0042_bug_reports` (coluna `bug` jsonb). Áreas repetidas em `BUG_AREAS` na API e no cliente.
- Painel: o resumo à vista, os campos e o contexto ao abrir (`BugDetails`).
