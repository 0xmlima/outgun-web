# OG-493 — Treino Ataque: entrar na base e sair do quadrado com a bandeira

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-490, OG-491 |
| Regras de negócio | RN-TRN-02, RN-TRN-04, D-86 |
| Skills | `outgun-card-workflow` |

## História
Como atacante, quero treinar entrar numa base defendida e sair com a bandeira.

## Contexto
- Pedido do PO (2026-10-28): presets de treino na sala privada Casual. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TZn2Kuj8ZwDVQfoB5G8Rbn, cópia em `plan/specs/modos-de-treino/proposta.html`); respostas na D-86.
- P2: defensores de 1 a 4.

## Escopo
- Você (e convidados do mesmo lado, OG-497) começa fora da sala da base inimiga; 1 a 4 bots com papel **guardar a base** na base inimiga; bandeira inimiga no ponto.
- Falha: o atacante morre (com convidados, todos os humanos do lado de treino).
- Sucesso: todos os defensores derrubados, ou o portador sai da sala da base com a bandeira.

## Critérios de aceite
- [ ] As três condições de fim funcionam e reiniciam a tentativa.

## Notas de implementação
