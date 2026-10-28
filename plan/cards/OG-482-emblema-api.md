# OG-482 — Emblema do clã: API, unicidade e permissões (líder e admins)

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S51 |
| Status | Concluído |
| Dependências | OG-480 |
| Regras de negócio | RN-EMB-02, RN-EMB-03, RN-CLA-03, RN-CLA-08 |
| Skills | `outgun-card-workflow` |

## História
Como líder ou admin de clã, quero escolher e trocar o emblema do clã, com a garantia de que nenhum outro clã tem um igual.

## Contexto
- Pedido da comunidade (2026-10-28): identidade visual do clã a partir de uma prancha enviada por um membro. Proposta discutida num artifact (https://claude.ai/artifact/1gbxDv1TRgpon4t9N1yeyF, cópia em `plan/specs/emblema-do-cla/proposta.html`); respostas na D-85.
- PO: todos os cards do emblema (OG-480 a OG-489) entram na mesma sprint.
- P2: líder **e** admins escolhem e trocam. P3: cada combinação é única.

## Escopo
- Migração **nova**: `clans.emblem` (jsonb, null = padrão) e `clans.emblem_key` com índice único (null não conta). Clãs atuais ficam com o padrão (escudo + tag, sempre único porque a tag é única).
- `PUT /clans/:tag/emblem` (líder e admins): valida contra o catálogo e as molduras liberadas (OG-488); combinação ocupada → 409 `emblem_taken`. `GET /clans/:tag/emblem/taken?frame=&symbol=` (ou similar) para o editor desabilitar o que está ocupado.
- Troca de **cores** do clã (OG-407) recalcula a chave: se colidir com outro clã, recusa com o mesmo erro.
- Troca de tag com símbolo `tag`: a chave muda junto (tag única, sem colisão).
- Moderação: moderador volta o emblema ao padrão, com auditoria (como RN-CLA-08). Sem espera entre trocas.
- Emblema no `ClanSchema` (página do clã, listas, ranking) e no OpenAPI.

## Critérios de aceite
- [x] Testes: permissão (líder, admin, membro), colisão por emblema, colisão por troca de cor, colisão com inversão, padrão, reset da moderação.

## Notas de implementação
- Migração 0046: `clans.emblem` (jsonb) e `clans.emblem_key` (índice único). A chave é recalculada em `updateClan` sempre que muda emblema, tag ou cores, então PATCH de cores, troca de tag e moderação passam pelo mesmo `emblem_taken`.
- `PUT /clans/:tag/emblem` (`null` = padrão) e `GET /clans/:tag/emblem/taken` (chaves dos outros clãs; o editor compara com `emblemKey`).
- Moderação: `PATCH /admin/clans/:tag` com `resetEmblem: true` (auditoria `clan-edit` com o emblema anterior). Molduras do hall ficam para o OG-488.
- Testes escritos sem rodar (rodam no fechamento da sprint).
