# OG-082 — Nome de usuário em jogo, troca de nome e clan tag

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S8 |
| Status | Em revisão |
| Dependências | [OG-081](OG-081-auth.md) |
| Regras de negócio | RN-NOM-01, RN-NOM-02, RN-NOM-03 |
| Skills | `outgun-re-spec` |

## História
Como jogador registrado, quero que meu nome de usuário seja meu nome em jogo e que ninguém o use, e quero exibir a tag do meu clã.

## Contexto e referências no original
- `check_name` (`commont.cpp:190`), `AuthorizationDatabase::makeComparable` (`auth.cpp`).

## Escopo
- O nome de usuário da conta (OG-081) é o nome em jogo (RN-NOM-02); validação RN-NOM-01 e unicidade normalizada ficam no cadastro.
- Convidados (só Casual) recebem nome com sufixo e não podem usar nome registrado.
- Troca de nome de usuário com cooldown (ex. 30 dias); o nome antigo fica reservado por um tempo.
- Clan tag.

## Critérios de aceite
- [x] Convidado não consegue usar nick registrado (comparação normalizada).
- [x] Testes com acentos, espaços e caracteres não imprimíveis.

## Notas técnicas
- —

## Notas de implementação
- Spec: [plan/specs/names.md](../specs/names.md); decisão **D-20** (PLAN seção 12) e RN-NOM-02 atualizada.
- **Regras compartilhadas** em `packages/protocol/src/names.ts` (API, game server e cliente usam as mesmas): `checkName` (= `check_name`, + só Latin-1), `makeComparable` (original), `comparableName` (com acentos dobrados: José = JOSE = Jösé; ß→ss, Æ→ae, Þ→th), `checkRegisteredName` (exige letra ou dígito, como o `auth.txt`), `guestName` (sufixo `*`, cortado para caber em 15), `checkClanTag`, `chatName` (`(TAG) nome`, `server.cpp:1513`). O `checkName` provisório do OG-081 na API foi removido.
- **API:** `username_key` passa a ser `comparableName`. Migration `0003_reserved_names`. `POST /account/username` (pede a senha; carência de 30 dias; mudar só a grafia do mesmo nome não conta; o nome antigo fica reservado ao dono por 90 dias e ele pode voltar a usá-lo), `PUT /account/clan-tag`, `GET /names/check` (válido, registrável, ocupado, nome de convidado). `checkGuestName` (em `src/auth/names.ts`) é o que o ticket do OG-083 vai usar para convidados.
- Contas criadas antes desta mudança têm `username_key` no formato antigo (NFKC + minúsculas); só existem em bancos de desenvolvimento — recrie com o seed.
- Em jogo não há troca de nome (no original era livre, com 1 s de intervalo): o nome vem da conta pelo ticket.
- **Testes:** 36 vetores em `packages/protocol/src/names.test.ts` (acentos, espaços, NBSP, controle, DEL, grego, ligaduras, convidados, tag) e 7 de integração em `apps/api/src/routes/names.test.ts` (unicidade normalizada, convidado × nome registrado e reservado, carência, reserva e vencimento, clan tag). Roteiro E2E `tools/visual-compare/auth.mjs` ganhou clan tag e troca de nome (19/19); prints `og081-8-trocar-nome.png` e `og081-9-conta-nome-tag.png`.
- **Cliente web:** na Conta, "Trocar nome" e "Clan tag" (telas próprias).
