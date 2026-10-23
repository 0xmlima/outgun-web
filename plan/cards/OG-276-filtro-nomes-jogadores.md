# OG-276 — Filtro de nomes proibidos também nos nomes de jogador

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S42 |
| Status | Em revisão |
| Dependências | [OG-275](OG-275-clas-moderacao.md) |
| Regras de negócio | RN-CLA-08, RN-NOM-01 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero que o mesmo filtro de nomes proibidos dos clãs valha para o cadastro e a troca de nome dos jogadores, para não ter de agir depois.

## Contexto
- Achado no OG-275: o "filtro de nomes proibidos dos jogadores" citado no card não existia. O OG-275 criou `NAME_FILTER` (apps/api/src/name-filter.ts) e o aplica só a nome, tag e descrição de clã.

## Escopo
- Aplicar `nameBlocked` em `POST /auth/register`, `POST /account/username` e, se fizer sentido, no nome de convidado (`checkGuestName`).
- Mensagem "Este nome não é permitido." no cliente.

## Critérios de aceite
- [x] Testes: cadastro e troca de nome recusados com palavra da lista (sem diferença de maiúsculas e acentos).

## Notas de implementação
- Erro `name_not_allowed` (400) no cadastro, na troca de nome e no nome de convidado (`/rooms/.../join`); `/names/check` responde `registrable: false` e `guestName: null`. Mensagem "Este nome não é permitido." no cadastro, na conta e ao entrar como convidado. A lista é a mesma `NAME_FILTER` dos clãs.
(preenchido durante a execução)
