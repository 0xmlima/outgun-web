# OG-275 — Moderação de clãs no painel admin

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S16 |
| Status | Em revisão |
| Dependências | [OG-270](OG-270-clas-cadastro-api.md) |
| Regras de negócio | RN-CLA-08 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero agir sobre clãs com nome, tag ou descrição ofensivos, para manter a comunidade saudável.

## Escopo
- Denunciar clã (mesmo fluxo de denúncia do jogo); no painel: lista de clãs, forçar troca de nome/tag/descrição, dissolver; tudo na auditoria.
- Nome e tag passam pelo mesmo filtro de nomes proibidos dos jogadores.

## Critérios de aceite
- [x] Ações registradas na auditoria; só moderador/admin acessa.

## Notas de implementação
- Denúncia: `POST /clans/:tag/report` grava em `player_reports` (`server_id` 'web', `clan_id`, alvo "(TAG) nome"); uma aberta por pessoa e clã. Aparece na aba Denúncias do painel.
- Painel: aba "Clãs" (denunciados primeiro), forçar troca e dissolver com motivo; auditoria `clan-edit`/`clan-dissolve` com o antes e o depois. Dissolver pelo painel não gera carência.
- O "filtro de nomes proibidos dos jogadores" não existia: criei `NAME_FILTER` (só clãs por ora) e o card **OG-276** (Backlog) para estendê-lo aos nomes de jogador. A moderação não passa pelo filtro.
