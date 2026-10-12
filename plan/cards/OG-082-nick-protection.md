# OG-082 — Nick protegido e clan tag

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
Como jogador registrado, quero que ninguém use meu nick, e quero exibir a tag do meu clã.

## Contexto e referências no original
- `check_name` (`commont.cpp:190`), `AuthorizationDatabase::makeComparable` (`auth.cpp`).

## Escopo
- Validação de nick (RN-NOM-01), unicidade normalizada, troca de nick com cooldown, clan tag.

## Critérios de aceite
- [ ] Convidado não consegue usar nick registrado (comparação normalizada).
- [ ] Testes com acentos, espaços e caracteres não imprimíveis.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
