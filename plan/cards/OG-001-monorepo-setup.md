# OG-001 — Setup do monorepo TypeScript e CI

| Campo | Valor |
|---|---|
| Épico | E0 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S0 |
| Status | Em revisão |
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
- [x] `pnpm i && pnpm build && pnpm test` funciona do zero em máquina limpa.
- [ ] CI roda em PR e bloqueia merge se falhar. _(workflow pronto em `.github/workflows/ci.yml`; falta publicar o repositório no GitHub e ativar branch protection exigindo o job `ci`)_
- [x] `packages/sim` não tem dependências de runtime e não importa APIs de Node nem de DOM (regra de lint).
- [x] Arquivos originais do Outgun não foram modificados (verificável por diff/checksum).

## Notas técnicas
- Usar `tsconfig` base com `paths` para os pacotes internos.
- Regra ESLint `no-restricted-globals`/`no-restricted-imports` em `packages/sim` para garantir portabilidade.

## Notas de implementação
- **Layout:** monorepo na raiz, ao lado do código original (não movido para `legacy/`), para manter válidas as referências `src/...` do plano, specs e skills. PLAN 5.2 atualizado.
- **Versões:** Node ≥ 22 (`.nvmrc` 22; testado com Node 24.14), pnpm 12.11.2 via Corepack (`packageManager`), Turborepo 2.11, Vitest 5, ESLint 10 + typescript-eslint 8.71, Prettier 3.9.
- **TypeScript fixado em `~6.0`**: o TS 7 (`latest`) ainda não é suportado pelo typescript-eslint 8.71 (peer `<6.1.0`). Reavaliar quando houver suporte.
- **Módulos:** `module`/`moduleResolution` `NodeNext` (imports com extensão `.js`); cada pacote compila para `dist/` e expõe `exports`. O app web poderá sobrescrever para `bundler` no OG-060.
- **Pureza do `packages/sim`:** ESLint proíbe `Math.random`, `Date.now`, globais de Node/DOM e imports `node:*` (testado com arquivo de prova).
- **Integridade do original:** `pnpm check:legacy` compara 454 arquivos com `tools/legacy-integrity/checksums.sha256` (gerado do commit base `34ff905`). Prettier e ESLint ignoram o original.
- **`pnpm verify`** roda a mesma sequência do CI. Validado em clone limpo com `pnpm install --frozen-lockfile`.
- **`AGENTS.md`** é gerado pelo próprio Turborepo ao detectar um agente; mantido versionado, como ele recomenda.
- Os apps (`web`, `game-server`, `api`) são placeholders; Vite/React/Pixi, uWebSockets.js e Fastify entram nos cards OG-060, OG-040 e OG-080.
- Branch: `og-001-monorepo-setup`.
