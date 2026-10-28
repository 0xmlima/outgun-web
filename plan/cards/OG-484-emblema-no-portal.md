# OG-484 — Emblema do clã nas telas do portal e no lobby Ranked

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S51 |
| Status | Em revisão |
| Dependências | OG-482 |
| Regras de negócio | RN-EMB-04, RN-UI-01, RN-UI-08 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver o emblema dos clãs onde o clã aparece fora da partida, para reconhecer cada clã de relance.

## Contexto
- Pedido da comunidade (2026-10-28): identidade visual do clã a partir de uma prancha enviada por um membro. Proposta discutida num artifact (https://claude.ai/artifact/1gbxDv1TRgpon4t9N1yeyF, cópia em `plan/specs/emblema-do-cla/proposta.html`); respostas na D-85.
- PO: todos os cards do emblema (OG-480 a OG-489) entram na mesma sprint.

## Escopo
- Página do clã (grande) e lista de clãs; ranking de clãs e hall da fama de clãs (`leaderboard.tsx`, `HallOfFame.tsx`); perfil e lista de jogadores, ao lado da tag; tela inicial (painel da conta); lobby Ranked e série clã x clã (os dois emblemas no confronto).
- Componente único `ClanEmblem` (tamanhos 16–128) no design system.
- Celular nas telas do portal (D-80).

## Critérios de aceite
- [x] Emblema em todas as telas listadas, nos dois temas, sem rolagem horizontal no celular.

## Notas de implementação
- Em vez de pôr o emblema em cada resposta da API, `GET /clans/emblems?tags=` (em lote) + `ClanBadge` em `ui/Emblem.tsx`: junta os pedidos do mesmo instante numa chamada e guarda em cache (`forgetEmblem` ao salvar cores ou emblema). O nome `ClanEmblem` já é o tipo do protocolo, por isso `ClanBadge`/`Emblem`.
- Telas: página do clã (112 px), lista de clãs, aba de clãs e ranking de clãs (Jogadores), hall da fama de clãs, ranking de jogadores, listas e nome do perfil, painel de clã do perfil, tela inicial e os dois lados do lobby Ranked (vale para a série, que usa o mesmo lobby).
- Não conferido em tela (regra de não rodar o jogo); celular depende só de `flex-wrap`/inline.
