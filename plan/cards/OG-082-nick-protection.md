# OG-082 — Nome de usuário em jogo, troca de nome e clan tag

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S8 |
| Status | Backlog |
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
- [ ] Convidado não consegue usar nick registrado (comparação normalizada).
- [ ] Testes com acentos, espaços e caracteres não imprimíveis.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
