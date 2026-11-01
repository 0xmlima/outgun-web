# OG-535 — Som do jogo no espectador, pronto para transmissão

| Campo | Valor |
|---|---|
| Épico | E6 |
| Tipo | Melhoria |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S57 |
| Status | Em andamento |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como quem transmite a OutCup, quero que o espectador toque os sons do jogo como um jogador ouviria na sala que está sendo mostrada, para a transmissão ter o clima da partida.

## Contexto
- Pedido do PO em 2026-11-01. O espectador já cria um `SoundPlayer` (`apps/web/src/game/replay-host.ts:105-112`, ligado às preferências), mas:
  - Os sons de sala que o servidor manda a cada jogador (`screenSample` → `message('sound')`, `apps/game-server/src/room.ts:506-510`) vão por `queueTo` e **não entram no replay** (só o `outbox` de broadcast é gravado), então o espectador não os recebe.
  - No replay todos os jogadores vêm "na tela": mortes (`kill`, `suicideEvent`) e quiques (`playerHitWall`, `playerHitPlayer`, sem checagem de sala em `sound-events.ts`) tocam para o mapa inteiro, e não só para a sala mostrada.
  - Sem seguir ninguém, `me = -1`: sons ligados ao próprio jogador (ex.: `spree`) não fazem sentido.
  - Aberto por link, o áudio só destrava depois de uma tecla/clique (política do navegador), sem aviso na tela.
  - A música da partida (`useMusicMode('match')`) toca por cima; na transmissão pode atrapalhar ou gerar reclamação de direitos.

## Escopo
- Gravar no replay os sons de sala (`sound` com a sala de origem) e tocá-los no espectador/replay só quando a sala de origem é a mostrada.
- Mortes e quiques no espectador só para a sala mostrada (seguindo alguém: a sala dele).
- Aviso discreto "Clique para ativar o som" enquanto o `AudioContext` estiver suspenso.
- No espectador, controles separados: sons do jogo (M) e música (tecla própria), com a música desligada por padrão no espectador.
- Replays gravados antes do card continuam abrindo (sem os sons de sala).

## Critérios de aceite
- [ ] Teste de `SoundEvents`: no espectador, quique e morte em outra sala não tocam; na sala mostrada tocam.
- [ ] Teste do replay: `sound` de sala gravado com a sala e tocado só nela.
- [ ] Aviso de áudio bloqueado aparece e some no primeiro clique.
- [ ] Música e sons ligam/desligam separados no espectador.

## Notas técnicas
- Mudança de protocolo do replay: versão nova do formato se o `sound` ganhar campos; manter leitura do formato antigo.

## Notas de implementação
