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
| Regras de negócio | RN-CFG-01, RN-CFG-02, RN-CFG-03, RN-MOD-02, RN-MOD-04 |
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
- Cada preset pertence a um modo (D-10, RN-MOD). **Casual:** Clássico (padrão), Duelo, Insta, Caos. **Ranked:** um único preset **Ranked** = Clássico com `pups_min 0`, `pups_max 0`, `pup_start_*` desligados e `pups_drop_at_death 0`, marcado como travado.

## Critérios de aceite
- [ ] Todas as settings de `server_settings.cpp` existem no schema (teste compara a lista extraída).
- [ ] `config/gamemod.txt` importa sem erros e gera o preset Clássico.
- [ ] Valores fora da faixa são rejeitados com mensagem clara.
- [ ] O preset Ranked desliga todos os power-ups e é recusado como base para alterações (`locked: true`).

## Notas técnicas
- Resolver D-01 antes de fechar.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
