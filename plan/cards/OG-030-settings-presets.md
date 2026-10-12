# OG-030 — Settings tipados e presets de sala

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S2 |
| Status | Backlog |
| Dependências | [OG-004](OG-004-constants-and-units.md) |
| Regras de negócio | RN-CFG-01, RN-CFG-02, RN-CFG-03 |
| Skills | `outgun-re-spec` |

## História
Como admin de sala, quero escolher um preset e ajustar settings válidos, para criar variações de jogo como os gamemods do original.

## Contexto e referências no original
- `src/server_settings.cpp` (registro completo com faixas).
- `config/gamemod.txt` (preset Clássico).
- `doc/gamemod.html`.
- Defaults do código em `WorldSettings::reset`, `PowerupSettings::reset`, `PhysicalSettings()`.

## Escopo
- `packages/settings`: schema (zod) com tipo, faixa, default de código e default Clássico, categoria e se é editável em sala ranqueada.
- Parser do formato gamemod (importar arquivos de comunidade).
- Presets: Clássico, Duelo, Insta, Caos, Sem power-ups.

## Critérios de aceite
- [ ] Todas as settings de `server_settings.cpp` existem no schema (teste compara a lista extraída).
- [ ] `config/gamemod.txt` importa sem erros e gera o preset Clássico.
- [ ] Valores fora da faixa são rejeitados com mensagem clara.

## Notas técnicas
- Resolver D-01 antes de fechar.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
