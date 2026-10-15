# OG-270 — Clãs: cadastro, papéis e API (substitui a clan tag livre)

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S16 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | RN-CLA-01 a RN-CLA-05, RN-NOM-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero criar um clã de verdade, com nome, tag e membros, para que a tag mostre a que grupo eu pertenço e não seja só um texto que qualquer um digita.

## Contexto
- Hoje: `users.clan_tag` livre (até 6 caracteres), definida em `POST /account/clan-tag` (OG-082); vai no ticket (`clan`) e aparece no chat como `(TAG) nome`.

## Escopo
- Tabelas `clans` (nome, tag, descrição, data de formação, líder) e `clan_members` (papel: líder/admin/membro, data de entrada); um clã por jogador.
- Tag: 1 a 2 caracteres, única sem diferença de maiúsculas e acentos; nome único do mesmo jeito (D-47). Máximo de 30 membros.
- API: criar, editar (nome/descrição — líder e admins; tag — só o líder), sair, expulsar, promover/rebaixar admin, transferir liderança, dissolver; página pública do clã (`GET /clans/:tag`) e busca.
- Líder que sai passa a liderança ao admin mais antigo (senão ao membro mais antigo); último membro que sai dissolve o clã (D-47).
- A tag exibida em jogo (ticket, chat, HUD) passa a vir do clã do jogador; `POST /account/clan-tag` é removida e as tags livres antigas são apagadas na migração (D-47) — avisar na tela de novidades/Opções que a tag virou clã.

## Critérios de aceite
- [x] Testes: tag duplicada (inclusive `nn` × `NN`) recusada; jogador não entra em dois clãs; regras de papéis e de saída do líder.
- [x] O ticket da sala leva a tag do clã atual; jogador sem clã não tem tag.
- [x] OpenAPI atualizada.

## Notas de implementação
- `users.clan_tag` virou cópia da tag do clã, mantida por gatilhos (0016); ticket, chat, ranking e busca seguem lendo a coluna. Tags livres apagadas na migração.
- Nome do clã: 3 a 24 caracteres com as regras do nome de jogador; descrição até 500. Dobra de nome/tag: `foldAccents` + minúsculas (`clanKey`).
- `leaveClan` também roda na exclusão da conta. A tela antiga de clan tag virou aviso até as telas do OG-272; carência e entrada (convite/pedido) ficam no OG-271; filtro de nomes proibidos no OG-275.
- Testes escritos mas não rodados (a suíte roda no fechamento da sprint).
