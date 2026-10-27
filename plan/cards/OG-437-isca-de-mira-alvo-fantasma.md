# OG-437 — Isca de mira: alvo fantasma por cliente

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Could |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-042, OG-104 |
| Regras de negócio | RN-VIS-01, RN-VIS-02, RN-BOT-02 |
| Skills | `outgun-card-workflow` |

## História
Como operador, quero uma evidência difícil de contestar de mira automática, sem punir quem só é bom.

## Contexto
- O snapshot já é montado por cliente (`aoi.ts`), então dá para colocar no pacote de **um** jogador um alvo que não existe na simulação.
- Um humano não tem como reagir a algo que o cliente oficial não desenha; um leitor de estado/aimbot ingênuo mira em tudo o que aparece no frame e atira na isca. O tiro é a evidência.
- É um sinal a mais, não uma prova: um cheat sofisticado pode filtrar o `pid` reservado. Vale como armadilha para o que roda hoje (o mesmo cliente de protocolo cru que joga sem ser notado), não como solução definitiva.

## Escopo
- Alvo fantasma sorteado com baixa probabilidade (ex.: 1 em N partidas por jogador), só no snapshot de um cliente, com `pid` reservado que nenhum time usa (ex.: 30 com 16 jogadores) e uma posição plausível, fora do caminho real.
- A isca não entra na simulação: sem colisão, sem dano, sem estatística, sem pontuação, sem bandeira, sem chat, sem minimapa de aliados e **invisível para os bots** (RN-BOT-02).
- O cliente oficial ignora o `pid` reservado (sem render, sem HUD, sem som); o replay não grava a isca.
- Evidência no relatório: girou a arma na direção da isca, atirou, quantas vezes e em que frames — visível só no painel.
- Liga/desliga por ambiente (`ANTICHEAT_DECOY=0`) e por sala; custo zero quando desligada.
- Se o filtro no cliente oficial se mostrar invasivo demais, o card vira um spike com o resultado medido (o resto continua valendo).

## Critérios de aceite
- [ ] Com a isca ligada, um cliente oficial joga uma partida inteira sem ver, ouvir ou colidir com ela (teste e conferência ao vivo).
- [ ] Cliente de teste que mira no `pid` reservado gera evidência no relatório; nenhum outro jogador vê a isca.
- [ ] Bots não reagem à isca (teste: partida só de bots com a isca ligada termina igual à de controle).
- [ ] Desligada por env, sem custo mensurável no tick.

## Notas técnicas
- `aoi.ts` monta o frame por `RecipientState`; a isca entra na serialização (frame e, se fizer sentido, minimapa), nunca em `world.players`.
- Cuidado com `rocketFire`/`rocketDelete`/`vislist`: o tiro na isca não pode criar foguete de verdade nem revelar posição.
- `pid` reservado precisa caber na faixa que o cliente e o protocolo aceitam hoje (32 jogadores no original) — validar no cliente antes de ligar em produção.

## Notas de implementação
—
