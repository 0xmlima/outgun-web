# OG-270 — Clãs: cadastro, papéis e API (substitui a clan tag livre)

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S16 |
| Status | Backlog |
| Dependências | — |
| Regras de negócio | RN-CLA-01 a RN-CLA-05, RN-NOM-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero criar um clã de verdade, com nome, tag e membros, para que a tag mostre a que grupo eu pertenço e não seja só um texto que qualquer um digita.

## Contexto
- Hoje: `users.clan_tag` livre (até 6 caracteres), definida em `POST /account/clan-tag` (OG-082); vai no ticket (`clan`) e aparece no chat como `(TAG) nome`.

## Escopo
- Tabelas `clans` (nome, tag, descrição, data de formação, líder) e `clan_members` (papel: líder/admin/membro, data de entrada); um clã por jogador.
- Tag: 1 a 2 caracteres, única sem diferença de maiúsculas e acentos; nome único (D-47).
- API: criar, editar (nome/descrição — líder e admins; tag — só o líder), sair, expulsar, promover/rebaixar admin, transferir liderança, dissolver; página pública do clã (`GET /clans/:tag`) e busca.
- Liderança e saídas conforme D-47 (líder sai → passa adiante; último membro sai → clã dissolvido).
- A tag exibida em jogo (ticket, chat, HUD) passa a vir do clã do jogador; `POST /account/clan-tag` é removida e as tags livres antigas são apagadas na migração (D-47).

## Critérios de aceite
- [ ] Testes: tag duplicada (inclusive `nn` × `NN`) recusada; jogador não entra em dois clãs; regras de papéis e de saída do líder.
- [ ] O ticket da sala leva a tag do clã atual; jogador sem clã não tem tag.
- [ ] OpenAPI atualizada.

## Notas de implementação
(preenchido durante a execução)
