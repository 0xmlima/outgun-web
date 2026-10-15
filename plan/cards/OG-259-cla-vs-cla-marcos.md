# OG-259 — Clã x clã: detecção e marcos

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S19 |
| Status | Concluído |
| Dependências | [OG-250](OG-250-formatos-series-ranked.md), [OG-270](OG-270-clas-cadastro-api.md) |
| Regras de negócio | RN-RKL-14, RN-SOC-03 |
| Skills | `outgun-card-workflow` |

## História
Como membro de um clã, quero que um jogo entre clãs seja reconhecido e me renda marcos, para registrar as guerras de clãs.

## Contexto
- Marcos: `packages/content/src/milestones.ts` e `apps/api/src/milestones.ts` (OG-213).

## Escopo
- Partida Ranked é **clã x clã** quando todos de um lado são do mesmo clã cadastrado (OG-270), todos do outro são de outro clã, e os dois lados estão completos (ex.: nn x BC). Bot substituto conta como do clã do jogador que ele substitui.
- Gravar a marcação (e os dois clãs) na partida/série; selo "Clã x clã" no relatório e na lista de salas/partidas.
- Marcos novos (lista validada pelo PO em 2026-10-15): Guerra de clãs, Primeira conquista, Veterano de guerra (10 partidas), Senhor da guerra (10 vitórias), Série conquistada, Varrida, Rivalidade (5 contra o mesmo clã), Defensor do clã; cálculo retroativo segue o OG-213.

## Critérios de aceite
- [x] Testes: 3 "nn" x 3 "BC" é clã x clã; 2 "nn" + 1 sem tag x 3 "BC" não é; "nn" x "nn" não é.
- [x] Marcos concedidos na transação da partida e pelo script retroativo.

## Notas técnicas
- Vale o clã do momento da partida (`clan_id` em `match_players`, OG-273).

## Notas de implementação
- Migration 0024: `match_players.clan_id` (clã cadastrado ao gravar a partida; já serve ao OG-273) e `matches.clan_war`/`red_clan_id`/`blue_clan_id`. Detecção em `apps/api/src/clan-war.ts`: só partidas com formato, lados com exatamente N jogadores.
- Bot substituto: o relatório aceita `clanId` em bot e o game server manda o `identity.clanId` do bot; quem montar o substituto (S20, D-46) só precisa copiar o clã do substituído para a identidade dele.
- Critérios dos marcos (validar com o PO): Série conquistada/Varrida = série md3/md5 clã x clã vencida (varrida sem perder jogo); Defensor do clã = vitória clã x clã sem sofrer captura; Rivalidade conta partidas contra o mesmo clã.
- Selo "Clã x clã" no relatório (com as tags) e nas partidas recentes do perfil; na lista de salas não (a sala não sabe os clãs antes do jogo). Partidas antigas não têm clã gravado, então o retroativo só vale daqui em diante.
