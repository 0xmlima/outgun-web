# OG-465 — Relato de bug: limpar o formulário depois de enviar e deixar mandar outro

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S50 |
| Status | Pronto |
| Dependências | — |
| Issue | [#21](https://github.com/thiagovasconcellos/outgun-web/issues/21) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero mandar vários relatos seguidos sem recarregar a página.

## Contexto
- Issue #21 (Portal; Médio; Sempre). 2.49.2, Chrome no Linux, jaru.
- Causa: em `FeedbackScreen.tsx`, depois do envio `sent` vira `true` e o botão fica `disabled={sent}` para sempre; os campos não são limpos.

## Escopo
- Depois de enviar: limpar os campos, manter a mensagem de agradecimento e reabilitar o botão quando o jogador mexer no formulário de novo.
- A lista "Meus relatos" continua atualizando (`MyReports refresh`).

## Critérios de aceite
- [ ] Depois de enviar, os campos ficam vazios.
- [ ] Dá para enviar um segundo relato sem recarregar.
- [ ] PO confere.

## Notas de implementação
(preenchido durante a execução)
