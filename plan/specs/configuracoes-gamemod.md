# Spec: configurações (gamemod) e presets
Card: OG-030 · RNs: RN-CFG-01..03, RN-MOD-02, RN-MOD-04, RN-FIS-07

## Resumo
Port do registro de settings e do leitor de gamemod do servidor original, com os mesmos tipos, faixas, unidades, mensagens e pós-processamento, mais os presets por modo de jogo (D-10).

## Fonte
- `src/server_settings.cpp:180-345` — `SettingManager::build`: lista, categorias, tipos e faixas.
- `src/server_settings.cpp:350-365` — `commit`: chances zeradas → `pups_max = 0`; `pups_min ≤ pups_max`.
- `src/server_settings.cpp:390-420` — `processLine` (`ist >> cmd; ist.ignore(); getline(ist, value)`, remoção de aspas) e `loadGamemod`.
- `src/server_settings.cpp:440-498` — `SettingManager::reset` (defaults de servidor).
- `src/gamemod.h`, `src/gamemod.cpp` — semântica de `GS_IntT`, `GS_FloatT`, `GS_Boolean`, `GS_String`, `GS_PowerupNum`, `GS_Percentage`, `GS_Balance`, `GS_Collisions`, `GS_RandomMap`.
- `src/world.cpp:1431-1450, 1494-1626` — defaults do código (`PhysicalSettings()`, `PowerupSettings::reset`, `WorldSettings::reset`).

## Algoritmo
1. Começa nos **defaults do código**. O preset Clássico aplica `config/gamemod.txt` (D-01).
2. Para cada linha (quebra em `\n`/`\r`; vazias e iniciadas por `;` ignoradas): comando = primeiro token; um caractere separador é descartado; valor = resto da linha; aspas nas duas pontas são removidas.
3. Comando desconhecido → `Unrecognized gamemod setting: '<cmd>'.`; valor recusado → `Can't set <nome> to '<valor>' - expecting <tipo>.` e o valor anterior é mantido.
4. Tipos:
   - inteiro: o número precisa ocupar o valor todo; faixa `[min, max]`, com 0 aceito se `allow0`; gravado como `valor × mul + add`;
   - real: igual ao inteiro, sem `mul`;
   - booleano: exatamente `0` ou `1`;
   - porcentagem: real ou `x %`, que vira `x / 100`;
   - power-ups: inteiro 0–32, ou `n %` relativo ao número de salas;
   - `balance_teams`: `no`, `balance` ou `shuffle`;
   - `player_collisions`: `no`/`0`, `normal`/`1` ou `special`/`2`.
5. Unidades: `time_limit`, `extra_time` e `vote_block_time` em minutos → frames (×600); `idlekick_time` em segundos → frames (×10, com 0 = desligado); `pup_shadow_invisibility` 0/1 → `shadow_minimum` 7/0.
6. Commit: soma das chances = 0 → `pups_max = 0`; se min e max estão na mesma unidade e `min > max`, ou se `max = 0`, então `min = max`.

## Peculiaridades preservadas
- `max_run_speed` fica em 27,1875 (defaults do código) no servidor, qualquer que seja a física do gamemod (RN-FIS-07).
- `server_name` com dois espaços antes do valor é recusado (o valor começa com espaço).

## Divergências intencionais
- Settings de rede, site e ranking antigos (`server_port`, `server_ip`, `relay_server`, `web_*`, `ranking_id`/`ranking_password`, `join_*`, `srvmonit_port`, `private_server`, `bot_name_file`, `tournament`) são aceitas e ignoradas (`web: 'ignored'`), para importar gamemods da comunidade.
- `map` só registra o nome; a validação do mapa fica com o servidor (parser do OG-010).
- `operator>>` em campos sem sinal aceitaria `-1` (vira 2³²−1); aqui é recusado.

## Presets (D-10)
| Preset | Modo | Travado | Diferença sobre o Clássico |
|---|---|---|---|
| `classic` | Casual | não | nenhuma |
| `duel` | Casual | não | 2 jogadores, sem bots |
| `insta` | Casual | não | `rocket_damage 300` |
| `chaos` | Casual | não | `pups_min 40%`, `pups_max 100%`, `pups_respawn_time 10` |
| `ranked` | Ranked | sim | sem power-ups: `pups_min/max 0`, `pups_drop_at_death 0`, todos os `pup_start_*` desligados |

## Vetores de teste
- Cabeçalho dos 17 traces (`tools/parity/traces`): valores efetivos de `WorldSettings`, `PowerupSettings` e `PhysicalSettings` no original. Inclui `settings-classic`, `settings-edge` (porcentagens, valores especiais e inválidos), `settings-no-powerups` (Ranked) e `settings-zero-chances`.
- Registro comparado com os nomes extraídos de `src/server_settings.cpp`.
