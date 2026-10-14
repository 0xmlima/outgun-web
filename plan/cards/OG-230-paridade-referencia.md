# OG-230 — Paridade vira referência: golden traces deixam de bloquear o CI

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como dev, quero poder mudar a física por achados do beta sem o CI exigir igualdade com o original.

## Contexto
- `pnpm parity` roda no CI (`.github/workflows/ci.yml:34`) comparando a sim com os golden traces do original (OG-003, OG-100). `parity-traces.yml` regrava os traces com o oráculo Docker.

## Escopo
- Quando o primeiro card de jogabilidade v2 mudar a sim: o job de paridade vira informativo (relatório, não bloqueia) ou é retirado; testes que fixavam o comportamento do original são trocados por testes da regra nova.
- Atualizar DEVELOPMENT.md e o DoD.

## Critérios de aceite
- [ ] CI verde com uma mudança intencional de física.

## Notas técnicas
- Fazer junto com o primeiro card do E11, não antes: enquanto a sim não muda, a paridade é um teste de regressão de graça.

## Notas de implementação
(preenchido durante a execução)
