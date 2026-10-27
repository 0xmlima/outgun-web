# OG-435 — Telemetria de automação por jogador e partida

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-028, OG-104 |
| Regras de negócio | RN-STA-01, RN-STA-03, RN-PLT-05 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero números objetivos de como cada jogador joga (cadência de entrada, tempo de reação, regularidade do tiro), para separar suspeita de achismo.

## Contexto
- Hoje o anti-cheat é o servidor autoritativo, a AOI e a taxa de mensagens (OG-104). O próprio relatório do OG-104 diz que mira assistida e leitura de tela ficam "fora do alcance" e que a resposta é a fila de denúncias — mas a fila chega sem nenhuma evidência além do texto de quem denunciou.
- Um cliente de protocolo cru (sem o cliente web) entra e joga uma partida inteira sem disparar nada. O que o servidor vê de graça é o **comportamento da entrada**: um cliente automático manda `input`/`fire` em intervalos quase constantes (10/20 Hz, jitter ~0), vira a arma e atira no mesmo frame (0 ms) e reage ao inimigo em 1–2 frames.
- Esses números também são úteis para o jogador (evolução de precisão) e para detectar teclado/gamepad quebrado, então não são lixo.

## Escopo
- Acumular por jogador e por partida, na sala, sem entrar em `packages/sim` nem no caminho quente do `tick`:
  - intervalo entre `input` e entre `fire` (média, desvio, p95, maior sequência com o mesmo intervalo);
  - latência entre a mudança de direção da arma e o tiro;
  - frames entre o inimigo ficar visível e o primeiro tiro que acerta;
  - % de tiros com a arma já alinhada ao alvo, precisão (`hits/shots`), duração, quedas e reconexões.
- Persistir junto do relatório da partida (`match-report.ts`) e da API: coluna JSON em `match_players` ou tabela `player_telemetry` com migration reversível; só partidas de jogadores com conta (bots ficam de fora, como nas estatísticas).
- Endpoint interno/admin: telemetria de uma partida e agregado por jogador nos últimos N dias.
- Nada visível ao jogador e nada de decisão automática; retenção definida junto da política de privacidade (OG-105), igual à D-33.

## Critérios de aceite
- [ ] Partida com 8 jogadores grava telemetria dos 8 humanos (bots fora), conferível por um teste de sala.
- [ ] Cliente de teste mandando `input` a 10 Hz exatos por 60 s aparece com desvio ~0; um cliente com jitter humano não.
- [ ] O relatório da partida continua válido sem a telemetria (partidas antigas e migration reversível).
- [ ] Sem impacto mensurável no tick (`tools/load` ou o custo por frame do `bot-stats`).

## Notas técnicas
- `room.ts` já vê cada `input`/`fire`; medir com um acumulador por `pid` e só fechar no fim da partida. Relógio de parede (`performance.now`) só fora da simulação — o `Rng` e o tick continuam determinísticos.
- A API é o lugar de agregar e servir (`apps/api/src/routes/admin.ts`), não o game server.
- Referência de motivação: `plan/reports/OG-104-seguranca.md`, seção "Anti-cheat no game server".

## Notas de implementação
—
