# OG-001 — Setup do monorepo TypeScript e CI

| Campo | Valor |
|---|---|
| Épico | E0 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S0 |
| Status | Em andamento |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como dev, quero um monorepo TypeScript com lint, testes e CI prontos, para que todos os pacotes (sim, protocol, content, web, game-server, api) evoluam com o mesmo padrão.

## Contexto e referências no original
- Seção 4 e 5.2 do PLAN.md (stack e layout).
- O código C++ original deve ficar intocado (mover para `legacy/` ou manter na raiz e criar `outgun-web/` ao lado — decidir no card e registrar).

## Escopo
- pnpm workspaces + Turborepo com `apps/web`, `apps/game-server`, `apps/api`, `packages/sim`, `packages/protocol`, `packages/content`, `packages/settings`, `packages/i18n`.
- TypeScript strict, ESLint, Prettier, Vitest em todos os pacotes.
- GitHub Actions: install com cache, lint, typecheck, test, build.
- `.editorconfig`, `.nvmrc` (Node 22 LTS), README de desenvolvimento.

## Critérios de aceite
- [ ] `pnpm i && pnpm build && pnpm test` funciona do zero em máquina limpa.
- [ ] CI roda em PR e bloqueia merge se falhar.
- [ ] `packages/sim` não tem dependências de runtime e não importa APIs de Node nem de DOM (regra de lint).
- [ ] Arquivos originais do Outgun não foram modificados (verificável por diff/checksum).

## Notas técnicas
- Usar `tsconfig` base com `paths` para os pacotes internos.
- Regra ESLint `no-restricted-globals`/`no-restricted-imports` em `packages/sim` para garantir portabilidade.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
