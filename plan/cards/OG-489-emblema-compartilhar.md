# OG-489 — Emblema do clã: imagem do confronto e PNG do emblema

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Could |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-484, OG-485 |
| Regras de negócio | RN-EMB-04 |
| Skills | `outgun-card-workflow` |

## História
Como membro de clã, quero baixar o emblema e uma imagem do confronto, para usar no WhatsApp e no Discord do clã.

## Contexto
- Pedido da comunidade (2026-10-28): identidade visual do clã a partir de uma prancha enviada por um membro. Proposta discutida num artifact (https://claude.ai/artifact/1gbxDv1TRgpon4t9N1yeyF, cópia em `plan/specs/emblema-do-cla/proposta.html`); respostas na D-85.
- PO: todos os cards do emblema (OG-480 a OG-489) entram na mesma sprint.
- P8: "Sim, se custar pouco". Se crescer além de 3 pts, cortar a imagem do confronto e ficar só com o PNG.

## Escopo
- Página do clã: baixar o emblema em PNG (128 e 512 px).
- Relatório da série clã x clã: imagem "TAG x TAG" com os dois emblemas e o placar, gerada no cliente (canvas), para baixar.

## Critérios de aceite
- [ ] PNG nítido nos dois tamanhos; imagem do confronto com nomes, emblemas e placar.

## Notas de implementação
