# Outgun 1.0.3 → Outgun Web

Este repositório contém o código-fonte original do Outgun (C++/Allegro, GPL v2+) e o plano do port para a web.

- Plano, regras de negócio e quadro de cards: `plan/PLAN.md`; cards em `plan/cards/`; specs em `plan/specs/`.
- **v2 (desde 2026-10-14):** o port terminou; o jogo agora evolui por conta própria (PLAN seção 15). Fidelidade ao original deixou de ser requisito.
- Para trabalhar num card, use a skill `outgun-card-workflow`; assets (temas, mapas, música) usam `outgun-asset-pipeline`. As skills de fidelidade (`outgun-re-spec`, `outgun-parity-harness`) estão desativadas em `.claude/skills-disabled/` (ver o README de lá para reativar).
- O jogo original fica em `_legacy/` (`_legacy/src/`, `_legacy/maps/`, `_legacy/config/`, `_legacy/graphics/`...). Não modifique nada ali: é referência histórica e fonte de assets. Citações como `src/world.cpp:3447` em comentários, specs e cards apontam para `_legacy/src/`.
- Os fontes C++ são ISO-8859-1 com CRLF: leia com `LC_ALL=C tr -d '\r' < _legacy/src/arquivo | sed -n 'A,Bp'`.
- Comandos do monorepo: `DEVELOPMENT.md` (`pnpm verify` roda tudo que o CI roda, inclusive `pnpm check:legacy`).
