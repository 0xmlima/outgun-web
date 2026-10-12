# OG-030 — Settings tipados e presets de sala

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S2 |
| Status | Em revisão |
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
- [x] Todas as settings de `server_settings.cpp` existem no schema (teste compara a lista extraída).
- [x] `config/gamemod.txt` importa sem erros e gera o preset Clássico.
- [x] Valores fora da faixa são rejeitados com mensagem clara.
- [x] O preset Ranked desliga todos os power-ups e é recusado como base para alterações (`locked: true`).

## Notas técnicas
- Resolver D-01 antes de fechar.

## Notas de implementação
- **Spec:** `plan/specs/configuracoes-gamemod.md`.
- **Pacote `@outgun/settings`:** `types.ts` (grupos `world`, `powerups`, `physics`, `server` e rotação de mapas, nas unidades do original, com os defaults do código); `registry.ts` (as 142 settings, com tipo, faixa, conversão de unidade e efeito na web: `sim`, `room` ou `ignored`); `gamemod.ts` (`applyGamemod`, `applySetting`, `commitSettings`); `presets.ts` (`classic`, `duel`, `insta`, `chaos`, `ranked`; `presetSettings`, `hasNoPowerups`); `classic-gamemod.ts` (o `config/gamemod.txt` embutido).
- **Paridade:** o patch de trace passou a gravar no cabeçalho os valores efetivos de mundo, power-ups e física **depois de o original ler o gamemod**. Os 17 traces (incluindo 4 novos cenários só de configuração) batem com o leitor TS em todos os campos.
- **Descoberta:** `max_run_speed` do servidor fica sempre em 27,1875 (defaults do código), pois o original nunca o recalcula após o gamemod. RN-FIS-07 foi corrigida no plano; o valor está em `physics.maxRunSpeed`.
- **Ferramenta:** o `grep` deste ambiente é uma função de shell que omitia resultados em arquivos ISO-8859-1; buscas no código original devem usar `/usr/bin/grep -a`. Algumas buscas antigas que pareciam vazias eram desse problema.
- **Ranked:** presets travados e o modo de cada preset ficam aqui; o OG-049 aplica a trava nas salas.
- 29 testes. Branch: `og-030-settings-presets`.
