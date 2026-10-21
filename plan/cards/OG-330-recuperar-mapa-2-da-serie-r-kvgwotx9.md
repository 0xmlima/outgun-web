# OG-330 — Recuperar o mapa 2 da série r-kvgwotx9 a partir do replay

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Operação |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S34 |
| Status | Em revisão |
| Dependências | OG-329 (no beta) |
| Regras de negócio | RN-RKL-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador que venceu a série, quero que o jogo perdido conte: partida no histórico, números e rating.

## Contexto
- O game server não reenvia nem guarda um resultado que a API recusou com 4xx (`platform.ts`); só o replay ficou: `/data/replays/r-kvgwotx9-mvhezg5o-2.ogr` (volume `replays` do game server).
- No banco, a série `r-kvgwotx9-mvhezg5o-s1` está em 1-0, aberta; os ratings dos 6 jogadores são os do fim do mapa 1 (iguais aos `playerInfo` do replay do mapa 2), então nada do mapa 2 foi aplicado.

## Escopo
- `tools/dev/rebuild-match.mjs`: monta o corpo de `POST /internal/matches` a partir do replay com o `matchReport` do game server; estatísticas das últimas mensagens `stats`/`movementShots`/`teamStats` (mais a captura do último frame, que não gera mensagem); ranking pelas regras do `ServerSim` (frag × modificador do time com os ratings do início; neg por morte, bandeira perdida na morte, suicídio e captura sofrida).
- `deploy/vps/resend-match.sh`: envia o corpo assinado como o game server, de dentro do contêiner (`DRY_RUN=1` só confere).
- Validação com o mapa 1 da mesma série, que está no banco: frags, kills, mortes, capturas, Δscore e Δneg iguais nos 5 jogadores e times iguais; tempos com erro < 0,5 s.

## Como aplicar (depois do deploy do OG-329, com autorização do PO)
1. `pnpm build`; baixar o replay: `ssh root@137.131.202.138 'cd /opt/outgun && docker compose exec -T game-server cat /data/replays/r-kvgwotx9-mvhezg5o-2.ogr' > r-kvgwotx9-mvhezg5o-2.ogr`
2. `node tools/dev/rebuild-match.mjs r-kvgwotx9-mvhezg5o-2.ogr params.json > report.json` (params abaixo; avisos no stderr devem vir vazios)
3. `DRY_RUN=1 bash deploy/vps/resend-match.sh root@137.131.202.138 report.json`, depois sem `DRY_RUN`: espera `HTTP 201`.
4. Conferir: série `r-kvgwotx9-mvhezg5o-s1` com 2 jogos, 2-0, `winner = 0`, `finished_at` preenchido; ratings somados.

```json
{
  "serverMatchId": "r-kvgwotx9-mvhezg5o-2",
  "replayUrl": "https://outgunweb.com.br/gs/replays/r-kvgwotx9-mvhezg5o-2.ogr",
  "endedAt": "2026-10-21T01:52:00.517Z",
  "rules": {
    "extraTime": 0,
    "timeLimit": 0,
    "suddenDeath": false,
    "captureLimit": 8,
    "extraTimePeriods": 1,
    "winScoreDifference": 1
  },
  "accounts": {
    "Nosf": "364deda8-e4d0-490b-b95d-aa09527aa374",
    "coiote": "363141be-bfc7-427f-a1c0-efc5c632b249",
    "jaru": "37ce876d-5201-4dcb-b68a-1cd6183b406c",
    "Felix": "24b69725-1837-4933-a119-7fc7c1157c5b",
    "shadow": "0a46b7d6-6188-4651-9943-81e6b25e852f",
    "master": "a3307bb8-e607-492d-a00d-b8df1aeba6a6"
  },
  "format": "3x3",
  "series": {
    "serverSeriesId": "r-kvgwotx9-mvhezg5o-s1",
    "bestOf": 3,
    "gameNo": 2,
    "redWins": 2,
    "blueWins": 0,
    "finished": true,
    "winner": 0
  }
}
```

Resultado esperado (3x3 Duel, vermelho 8 x 4 azul; modificadores ×0,82 vermelho, ×1,22 azul):

| Time | Jogador | Frags | Kills | Mortes | Capt. | Δscore | Δneg |
|---|---|---|---|---|---|---|---|
| Vermelho | coiote | 127 | 52 | 31 | 1 | +103 | +42 |
| Vermelho | jaru | 109 | 38 | 43 | 3 | +89 | +58 |
| Vermelho | Nosf | 104 | 27 | 38 | 4 | +84 | +55 |
| Azul | master | 113 | 48 | 28 | 2 | +138 | +44 |
| Azul | shadow | 111 | 39 | 52 | 1 | +135 | +84 |
| Azul | Felix | 79 | 25 | 37 | 1 | +96 | +59 |

## Critérios de aceite
- [x] Reconstrução validada com o mapa 1 (no banco).
- [ ] Mapa 2 gravado no beta, série fechada em 2-0 e ratings atualizados (aguarda o deploy do OG-329 e a autorização do PO).

## Notas de implementação
- `endedAt` estimado pelo log do game server (o `endedAt` do mapa 1 ficou 2,8 s antes do log "fim de partida"). Tempos (jogado, vivo, com bandeira) estimados com erro < 0,5 s.
- A ferramenta serve para outras partidas perdidas; partidas com saída de jogador ou bot substituto geram aviso, porque parte dos deltas já foi à API em `/internal/rating-deltas` e as substituições precisam vir nos params.
