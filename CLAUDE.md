# Outgun 1.0.3 → Outgun Web

Este repositório contém o código-fonte original do Outgun (C++/Allegro, GPL v2+) e o plano do port para a web.

- Plano, regras de negócio e quadro de cards: `plan/PLAN.md`; cards em `plan/cards/`; specs em `plan/specs/`.
- Para trabalhar num card, use a skill `outgun-card-workflow`. Cards de port exigem `outgun-re-spec`; cards de simulação exigem `outgun-parity-harness`; assets usam `outgun-asset-pipeline`.
- O jogo original fica em `_legacy/` (`_legacy/src/`, `_legacy/maps/`, `_legacy/config/`, `_legacy/graphics/`...). Não modifique nada ali: é a referência. Citações como `src/world.cpp:3447` em comentários, specs e cards apontam para `_legacy/src/`.
- Os fontes C++ são ISO-8859-1 com CRLF: leia com `LC_ALL=C tr -d '\r' < _legacy/src/arquivo | sed -n 'A,Bp'`.
- Comandos do monorepo: `DEVELOPMENT.md` (`pnpm verify` roda tudo que o CI roda, inclusive `pnpm check:legacy`).
