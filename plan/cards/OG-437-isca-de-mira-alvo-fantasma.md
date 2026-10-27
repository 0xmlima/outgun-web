# OG-437 — Spike: isca de mira (alvo fantasma por cliente)

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Spike |
| Prioridade | Could |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-042, OG-104 |
| Regras de negócio | RN-VIS-01, RN-VIS-02, RN-BOT-02 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero uma evidência difícil de contestar de cliente automático, para punir sem depender só de estatística.

## Contexto
- O snapshot já é montado por cliente (`aoi.ts`), então dá para colocar no pacote de **um** jogador um alvo que não existe na simulação.
- Um humano não reage a algo que o cliente oficial não desenha; um cliente de protocolo cru que mira em tudo o que vem no frame atira na isca. O tiro é a evidência.
- **Limite conhecido:** o repositório é público (GPL). Qualquer marca que o cliente oficial use para esconder a isca fica visível no código, e um cheat que copie o filtro escapa. A isca só pega quem não o copiou — por isso é spike, com decisão de seguir ou não no fim.

## Escopo
- Protótipo atrás de flag (`ANTICHEAT_DECOY=1` e por sala, desligado por padrão): alvo fantasma sorteado com baixa probabilidade (ex.: 1 em N partidas por jogador), só no snapshot de um cliente, numa posição plausível fora do caminho real.
- `pid` da isca: um slot livre da sala (abaixo de `maxPlayers`, nunca o `MAX_PLAYERS - 1`, que a simulação usa como dono neutro em `world/server.ts`); a isca some antes de o slot ser ocupado por um jogador de verdade.
- A isca não entra em `world.players`: sem colisão, dano, estatística, pontuação, bandeira, chat ou minimapa de aliados. Bots leem o mundo e não o snapshot, então não a veem (RN-BOT-02); o replay não a grava.
- O cliente oficial não desenha, não toca som e não mostra a isca no HUD.
- Evidência no relatório: o jogador virou para a isca e atirou, quantas vezes e em que frames — visível só no painel.
- Saída do spike: relatório curto em `plan/reports/OG-437-isca.md` (o que pegou com o cliente de teste, custo, risco de falso positivo, como o filtro ficou no cliente) e a recomendação seguir/descartar ao PO.

## Critérios de aceite
- [ ] Com a isca ligada, o cliente oficial joga uma partida inteira sem ver, ouvir ou colidir com ela (teste e conferência ao vivo pelo PO).
- [ ] Cliente de teste que mira em tudo o que vem no frame gera evidência no relatório; nenhum outro jogador recebe a isca.
- [ ] Partida só de bots com a isca ligada termina igual à de controle (mesma semente).
- [ ] Desligada por env, sem custo no tick; relatório do spike entregue com a recomendação.

## Notas técnicas
- `aoi.ts` monta o frame por `RecipientState`; a isca entra só na serialização do frame (e, se fizer sentido, do minimapa).
- Cuidado com `rocketFire`/`rocketDelete`/`vislist`: o tiro na isca não pode criar foguete de verdade nem revelar posição.
- UI da partida (RN-UI-05): o cliente oficial não pode mudar nada do que desenha hoje; rodar `pnpm visual:check`.

## Notas de implementação
—
