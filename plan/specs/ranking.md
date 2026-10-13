# Spec: ranking e temporadas
Card(s): OG-084 · RNs: RN-RNK-01..04, RN-PTS-02, RN-MOD-05, RN-TIM-01

## Resumo
O game server acumula, por jogador, deltas de **score** (frags × modificador do time) e de **neg**
(pontos negativos) enquanto o ranking está habilitado, e os envia ao fim de cada partida e quando o
jogador sai. A API soma os deltas por temporada e ordena o leaderboard por
`rating = (score+1)/(neg+1)` (D-02).

## Fonte
- `src/server.cpp:48` — `minimum_positive_score_for_ranking = 100`.
- `src/server.cpp:452-482` — `Server::refresh_team_score_modifiers`: força de cada time e `team_smul`.
- `src/server.cpp:484-486` — `Server::rankingEnabled`: login de ranking do servidor + mínimos de humanos/jogadores.
- `src/server.cpp:488-512` — `Server::score_frag` / `score_neg`: acumuladores `fdp`/`fdn` (double) e `delta_score`/`neg_delta_score` (`static_cast<int>` deles).
- `src/server.cpp:193-213` — `Server::ctf_game_restart`: envia os deltas de todos e só então aplica a mudança de participação (`next_participation` → `current_participation`).
- `src/server.cpp:1064-1075` — `Server::getLessScoredTeam`: `team_smul`, depois placar, depois `rand() % 2`.
- `src/server.cpp:1095-1104`, `1540-1556` — troca de nome e novo login também enviam os deltas antes.
- `src/servnet.cpp:924-960` — `ServerNetworking::client_report_status`: só com token válido e delta ≠ 0; manda `dscp`/`dscn` ao master e **zera** `delta_score`, `neg_delta_score`, `fdp`, `fdn`.
- `src/servnet.cpp:1543` — `client_disconnected` envia os deltas de quem sai; `src/servnet.cpp:3100-3103` — `stop()` envia os de todos.
- `src/servnet.cpp:1370-1384` — `client_connected`: empate de humanos e bots → `refresh_team_score_modifiers()` + `getLessScoredTeam()`.
- `src/servnet.cpp:1738-1745` — `data_ranking_participation`: a primeira informação vale na hora; as seguintes, no próximo `ctf_game_restart`.
- `src/servnet.cpp:2411-2413` — `score`/`neg_score` do jogador vêm do master (ranking global acumulado).
- `src/servnet.h:440` — `numDistinctClients`: endereços remotos distintos (+1 se houver jogadores locais).
- `src/world.cpp:2259-2261, 2320-2355, 2395, 3307, 3640-3665, 3684-3692` — chamadas a `score_frag`/`score_neg` (todas com `forRanking = true`: o parâmetro existe, mas nunca é falso).

## Settings e constantes
| Nome | Tipo | Faixa | Default código | Preset Clássico / Ranked | Uso |
|---|---|---|---|---|---|
| `ranking_minhumans` | int | 1..32 | 2 | 2 | humanos distintos para habilitar |
| `ranking_minplayers` | int | 2..32 | 4 | 4 | humanos + bots para habilitar |
| `respawn_balancing_time` | s | ≥ 0 | 0 | 0 | ≥ 5 → força do time é a **média** |
| `minimum_positive_score_for_ranking` | const | — | 100 | — | abaixo disso a força do jogador é 1,0 |
| limites do modificador | const | — | [0,3333; 3] | — | `bound(raw_inimigo/raw_próprio, .3333, 3.)` |

## Algoritmo
```
refresh_team_score_modifiers():
  raw = [0, 0]; n = [0, 0]
  para p em 0..maxplayers-1 com jogador em uso (humanos e bots):
    t = time(p)
    raw[t] += score(p) < 100 ? 1.0 : (score(p) + 1) / (neg(p) + 1)   // score/neg = ranking acumulado do jogador
    n[t]++
  se n[0] == 0 ou n[1] == 0: smul = [0, 0]; retorna
  se respawn_balancing_time >= 5: raw[t] /= n[t]
  smul[0] = clamp(raw[1] / raw[0], 0.3333, 3)
  smul[1] = clamp(raw[0] / raw[1], 0.3333, 3)

rankingEnabled() = sala Ranked                                  // web: substitui rankingLoginSet
                   e humanos distintos >= ranking_minhumans
                   e humanos distintos + bots >= ranking_minplayers

score_frag(p, amount):
  stats.frags += amount                          // sempre (placar da partida)
  se rankingEnabled() e participa(p):
    refresh_team_score_modifiers()
    fdp[p] += amount * smul[time(p)]
    delta_score[p] = trunc(fdp[p])

score_neg(p, amount):
  se rankingEnabled() e participa(p):
    fdn[p] += amount                             // sem modificador
    neg_delta_score[p] = trunc(fdn[p])

report(p):                                       // fim de partida, saída, troca de conta, parada
  se delta_score[p] == 0 e neg_delta_score[p] == 0: retorna
  envia (delta_score[p], neg_delta_score[p])
  delta_score = neg_delta_score = fdp = fdn = 0  // a fração de fdp que não virou inteiro se perde

getLessScoredTeam():                             // chamado logo após refresh_team_score_modifiers
  smul[0] > smul[1] → 0; smul[1] > smul[0] → 1
  placar[0] < placar[1] → 0; placar[1] < placar[0] → 1
  rand() % 2
```

## Posição no frame
`score_frag`/`score_neg` rodam dentro da simulação (mortes, capturas, pontos de posse); a sim web
os expõe como hooks `scoreFrag`/`scoreNeg`, chamados **depois** de somar o frag nas estatísticas.
O envio (`client_report_status`) roda em `ctf_game_restart` (início de cada mapa, inclusive o
reinício quando entra o 2º jogador), na saída do jogador e na parada do servidor.

## Casos de borda
1. Um time vazio: `smul = [0, 0]` → frags não somam score (só neg), embora a partida possa estar habilitada (bots contam como jogadores).
2. Frag negativo (matar companheiro −2, suicídio −1, largar bandeira pega −1) também é multiplicado pelo modificador e pode deixar o delta negativo.
3. `trunc` em direção a zero: `fdp = -0.6` → delta 0; `fdp = 2.9` → 2.
4. Ao enviar, a fração restante de `fdp` é descartada (não acumula para o próximo envio).
5. O ranking pode ser desabilitado no meio da partida (alguém sai): eventos seguintes não contam, os já acumulados são enviados normalmente.
6. Jogador com menos de 100 pontos de score acumulado vale 1,0 na força do time, qualquer que seja o neg.
7. Participação desligada: o jogador não acumula deltas, mas continua contando na força do time e nos mínimos.
8. Mudança de participação durante a partida só vale no próximo mapa (a primeira informação vale na hora).

## Divergências intencionais
- **Ranking por temporada (D-02)**: o master somava para sempre; a web soma por temporada (`ratings`), com `rating = (score+1)/(neg+1)`, mínimo de 100 de score para aparecer, desempate por score. A força usada no modificador é a da **temporada ativa**.
- **Habilitação**: `rankingLoginSet()` (servidor com id/senha do master) vira "sala Ranked" (RN-MOD-05). Humanos distintos = **contas** distintas (o original contava endereços IP); bots não existem no Ranked (D-11).
- **Participação** é uma preferência da conta (`player_profiles.ranking_participation`), lida pela API ao emitir o ticket; mudar vale na próxima entrada (o original aplicava no próximo mapa).
- **Envio**: o fim de partida manda os deltas junto do resultado (`POST /internal/matches`, partida `ranked`); saída do jogador, troca de mapa por voto, reinício com o 2º jogador e parada do servidor usam `POST /internal/rating-deltas`. Ambos idempotentes. A API não recalcula nada: soma os deltas recebidos.
- **Sem Redis** (D-24): leaderboard é uma consulta indexada no PostgreSQL.

## Vetores de teste
- Times 1×1, forças 1,0 × 1,0 → smul [1, 1]; frag +1 → delta 1.
- Vermelho (score 900, neg 99 → força 9,01) × azul (força 1,0) → smul vermelho = clamp(1/9,01) = 0,3333; azul = 3. Frag do azul +1 → `fdp` 3 → delta 3; três frags do vermelho → `fdp` 0,9999 → delta 0.
- `respawn_balancing_time 5`: vermelho 2 jogadores (1,0 + 3,0 = média 2,0) × azul 1 jogador 1,0 → smul vermelho 0,5, azul 2.
- Um time vazio → frag não gera delta; morte gera neg 1.
- 3 humanos no Ranked (mínimo 4) → nenhum delta.
