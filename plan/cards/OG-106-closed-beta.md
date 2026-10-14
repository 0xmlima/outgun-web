# OG-106 — Beta fechado: convites, feedback e triagem

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S12 |
| Status | Pronto |
| Dependências | [OG-087](OG-087-admin-panel.md), [OG-081](OG-081-auth.md) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero que só jogadores convidados entrem durante o beta e que eles avaliem o jogo dentro dele, para medir a fidelidade ao original e organizar os bugs.

## Contexto e referências no original
- Critério do OG-105: ≥ 20 veteranos avaliam a sensação de jogo como fiel (nota ≥ 4/5).

## Escopo
- Modo beta na API (`BETA=1`): cadastro e entrada nas salas só com conta convidada; convidados (sem conta) bloqueados nesse modo.
- Convites: códigos de uso único (ou por e-mail) gerados e revogados no painel admin, com quem convidou e quem usou; cadastro com código.
- Feedback no jogo: nota de fidelidade 1–5, nota geral, texto livre e tipo (bug, sugestão, elogio), com contexto automático (mapa, sala, versão, navegador, ping médio).
- Triagem no painel: lista com filtros, status (novo, confirmado, crítico, resolvido, descartado), média e distribuição das notas de fidelidade, quantos veteranos avaliaram.
- Auditoria das ações do painel; exportação CSV do feedback.

## Critérios de aceite
- [ ] Com `BETA=1`, sem convite não se cadastra nem entra numa sala (testado na API e no E2E).
- [ ] Feedback enviado do jogo aparece no painel com o contexto; a média de fidelidade é calculada.
- [ ] Ações do painel auditadas; acesso por papel testado.

## Notas técnicas
- Reaproveitar o painel (`apps/web/src/screens/AdminScreen.tsx`, `/admin/*`) e o padrão de migrations reversíveis.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
