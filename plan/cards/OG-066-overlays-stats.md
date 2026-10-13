# OG-066 — Telas F1–F5, Tab e lista de mapas

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S9 |
| Status | Em revisão |
| Dependências | [OG-065](OG-065-hud.md) |
| Regras de negócio | RN-STA-01, RN-STA-02, RN-VOT-01 |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero ver ajuda, lista de mapas/votos, estatísticas do time e dos jogadores e info do servidor durante a partida.

## Contexto e referências no original
- F1 ajuda, F2 mapas, F3 time, F4 jogadores, F5 servidor, Tab pings (`doc/game.html`).
- `draw_scoreboard`, `team_statistics`, `draw_statistics`, `map_list` (`graphics.h:163-178`).

## Escopo
- Overlays com as mesmas informações; ordenação da lista de mapas; votar digitando número + Enter.

## Critérios de aceite
- [x] Todas as telas implementadas e navegáveis por teclado.

## Notas técnicas
- —

## Notas de implementação
- Spec: [`plan/specs/telas-estatisticas.md`](../specs/telas-estatisticas.md).
- **Servidor** (`apps/game-server/src/stats-sync.ts`): `stats` de todos e `teamStats` dos dois times ao entrar (`send_stats`/`send_team_stats`); durante a partida, o retrato do jogador ou do time quando um contador muda (no máximo um por frame; só o tempo passando não manda nada); no fim, `movementShots` de cada um, `teamMovementShots` e `statsReady`, antes do placar. Divergência documentada na spec: o original recontava no cliente a partir dos eventos; aqui o servidor manda os mesmos valores.
- **Sessão** (`packages/netcode`): guarda estatísticas, ranking/conta de cada jogador (`playerInfo`), estatísticas de time, movimento/tiros (apagados no `startGame`, como `data_start_game`), nomes de quem saiu (capturas antigas) e as regras com as linhas de `/set` aplicadas.
- **Telas** (`apps/web/src/game/hud/info-screens.ts` + `screens/InfoOverlay.tsx`): F1 ajuda; F2 lista de mapas (↑/↓/PgUp/PgDn/Home/End, número + Enter vota, Backspace, Espaço/←/→ ordenam por número, votos, título, tamanho, autor; `*` no próprio voto, mapa atual em amarelo); F3 times + capturas com placar e rolagem; F4 jogadores em 4 páginas (↑/↓/←/→/PgUp/PgDn, Tab/Shift+Tab), flags `M`/`R`/`A`, ranking na 4ª; F5 regras do servidor (mesmas linhas do `TM_ServerSettings`, mais o preset). Esc fecha. Como no `client.cfg` distribuído, as setas ficam com a tela aberta (o resto dos controles segue).
- **Opções do OG-068 ligadas**: `Show stats after the round` abre F3/F4 no fim da partida e fecha no começo da próxima; `Show server info when connected` abre F5 ao entrar; Ctrl+N/F6 alterna nomes (Ctrl+F3 do original).
- Tab (pings no placar) já vinha do OG-065. Mapas favoritos e `Skip maps` com votos negativos ficam no OG-070.
- Prova: `info-screens.test.ts` (tempos, F3, F4, ordenações, F5), `stats-sync.test.ts` (retrato ao entrar, a cada mudança e no fim). E2E no Chrome com um segundo jogador: F2 → "3" + Enter → o outro jogador viu o voto (`[0,0,1,0]`); F3/F4/F5/F1 abertas e Esc fecha. Prints em `tools/parity/out/prints/066-*.png`.
