# Outgun 1.0.3 → Outgun Web

Este repositório contém o código-fonte original do Outgun (C++/Allegro, GPL v2+) e o plano do port para a web.

- Plano, regras de negócio e quadro de cards: `plan/PLAN.md`; cards em `plan/cards/`; specs em `plan/specs/`.
- Para trabalhar num card, use a skill `outgun-card-workflow`. Cards de port exigem `outgun-re-spec`; cards de simulação exigem `outgun-parity-harness`; assets usam `outgun-asset-pipeline`.
- Não modifique os arquivos do jogo original (`src/`, `maps/`, `cmaps/`, `config/`, `graphics/`, `sound/`, `fonts/`, `languages/`, `doc/`): são a referência.
- Os fontes C++ são ISO-8859-1 com CRLF: leia com `LC_ALL=C tr -d '\r' < arquivo | sed -n 'A,Bp'`.
