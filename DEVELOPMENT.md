# Desenvolvimento — Outgun Web

Este repositório tem duas partes:

- **Código original do Outgun 1.0.3** (raiz: `src/`, `maps/`, `config/`, `graphics/`...). É a referência do port e **não deve ser alterado**; `pnpm check:legacy` confere isso.
- **Monorepo do port web** (`apps/`, `packages/`, `tools/`), descrito em `plan/PLAN.md` (seção 5.2).

## Requisitos

- Node.js 22 ou superior (`.nvmrc`)
- pnpm via Corepack: `corepack enable` (a versão vem do campo `packageManager` do `package.json`)
- Docker (apenas para o oráculo do jogo original, `tools/parity/`)

## Comandos

| Comando                             | O que faz                                                     |
| ----------------------------------- | ------------------------------------------------------------- |
| `pnpm install`                      | Instala dependências de todos os pacotes                      |
| `pnpm build`                        | Compila todos os pacotes (Turborepo, em ordem de dependência) |
| `pnpm test`                         | Testes (Vitest)                                               |
| `pnpm typecheck`                    | Checagem de tipos                                             |
| `pnpm lint`                         | ESLint                                                        |
| `pnpm format` / `pnpm format:check` | Prettier                                                      |
| `pnpm check:legacy`                 | Confere que os arquivos do Outgun original estão intactos     |
| `pnpm check:licenses`               | Licenças das dependências de produção e cabeçalhos SPDX       |
| `pnpm verify`                       | Tudo acima, na ordem do CI                                    |

## Pacotes

| Pacote              | Papel                                                                            | Card            |
| ------------------- | -------------------------------------------------------------------------------- | --------------- |
| `packages/sim`      | Simulação determinística (port de `src/world.cpp`), sem dependências de Node/DOM | E2              |
| `packages/protocol` | Mensagens binárias cliente/servidor                                              | OG-041          |
| `packages/content`  | Mapas, gerador, manifesto de assets                                              | OG-010 a OG-012 |
| `packages/settings` | Configurações de sala e presets                                                  | OG-030          |
| `packages/i18n`     | Traduções                                                                        | OG-014          |
| `apps/game-server`  | Servidor de jogo (10 Hz)                                                         | OG-040          |
| `apps/api`          | Contas, ranking, salas                                                           | OG-080          |
| `apps/web`          | Cliente web                                                                      | OG-060          |

`packages/sim` tem regras de lint próprias: sem `Math.random`, `Date.now`, globais de Node/DOM ou imports `node:*`. Aleatoriedade vem de um `Rng` injetado (OG-004).

## Convenções

Fluxo de cards, branches e commits: `plan/PLAN.md` seção 8 e a skill `.claude/skills/outgun-card-workflow`. Arquivos novos levam o cabeçalho `SPDX-License-Identifier: GPL-2.0-or-later`.

## Licença e créditos

GPL-2.0-or-later (texto em `COPYING`, créditos em `CREDITS.md`). `pnpm check:licenses` exige o cabeçalho SPDX em todo código novo de `apps/`, `packages/` e `tools/` e só aceita dependências de produção com licença compatível (lista em `tools/license-check/check.mjs`). Ao adicionar uma dependência com licença fora da lista, discuta antes com o PO.

## Utilitários de desenvolvimento (`tools/dev/`)

- `bash tools/dev/verify.sh` — formata e roda `pnpm verify`; sucesso só se tudo passou (rodar antes de cada commit). Usa `corepack pnpm` se `pnpm` não estiver no PATH.
- `python3 tools/dev/set-status.py 042 "Em andamento"` — muda o status de um card no cabeçalho e na tabela da seção 10 do PLAN.
- `python3 tools/dev/fix-nbsp.py` — troca NBSP literal por ` ` nos fontes (a ferramenta de escrita do agente grava o caractere).
- `bash tools/dev/patch-workspace.sh DIR` — monta `DIR/a` (src original) e `DIR/b` (com o patch do oráculo) para editar `tools/parity/patches/001-trace.patch`; depois `(cd DIR && diff -ruN a b > …/001-trace.patch)` e `pnpm oracle build`.
