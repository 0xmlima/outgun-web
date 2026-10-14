# OG-106 — Beta fechado: convites, feedback e triagem

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S12 |
| Status | Em revisão |
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
- [x] Com `BETA=1`, sem convite não se cadastra nem entra numa sala (testado na API e no E2E).
- [x] Feedback enviado do jogo aparece no painel com o contexto; a média de fidelidade é calculada.
- [x] Ações do painel auditadas; acesso por papel testado.

## Notas técnicas
- Reaproveitar o painel (`apps/web/src/screens/AdminScreen.tsx`, `/admin/*`) e o padrão de migrations reversíveis.

## Notas de implementação
- Migration `0011_closed_beta` (reversível): `beta_invites`, `beta_invite_uses`, `feedback` (tipo, fidelidade 1–5, geral 1–5, veterano, texto, contexto, status, nota).
- API: `BETA=1` → `/auth/register` exige `invite` (aceita minúsculas e hífen; consumo atômico com trava de usos, validade e revogação; `invite_required`/`invalid_invite`) e a entrada nas salas exige conta (`beta_account_required`); `GET /beta`; `POST /feedback` (só com conta, 20/h, contexto + navegador). Painel: `/admin/invites` (admin: gerar até 50, usos, validade, observação; listar quem usou; revogar), `/admin/feedback` (moderador: lista, filtros, resumo com a última nota de cada pessoa — veteranos à parte, meta do OG-105 — e bugs críticos abertos), triagem auditada, CSV (fórmulas de planilha neutralizadas). CLI: `invite` e `role NOME papel`, para o primeiro admin num servidor novo.
- Cliente: campo de convite no cadastro quando o servidor está em beta (e preenchido pelo link), convidado sem conta mandado ao login, tela "Enviar feedback" (menu inicial e menu do jogo, com sala e mapa), abas Feedback e Convites no painel; textos pt-BR.
- Testes: `beta.test.ts` (5: sem convite/inválido/usado/revogado, papéis, convidado bloqueado, feedback, resumo, triagem auditada, CSV, comportamento sem beta); E2E com `BETA=1` (cadastro pelo link do convite, feedback depois da partida, cadastro sem convite recusado, "Jogar agora" sem conta → login, abas novas do painel).
- VPS: `install.sh` liga `BETA=1` quando o `.env` não diz nada (a publicação aberta põe `BETA=0`).
- Não coberto: espectador ao vivo continua sem conta (só assiste).
