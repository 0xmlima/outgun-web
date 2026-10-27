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
Como moderador, quero números objetivos de como cada jogador joga (tempo de reação, regularidade das teclas e do tiro), para separar suspeita de achismo.

## Contexto
- Hoje o anti-cheat é o servidor autoritativo, a AOI e a taxa de mensagens (OG-104). O relatório do OG-104 diz que mira assistida e leitura de tela ficam "fora do alcance" e que a resposta é a fila de denúncias — mas a fila chega sem nenhuma evidência além do texto de quem denunciou.
- Um cliente de protocolo cru (sem o cliente web) entra e joga uma partida inteira sem disparar nada. O que o servidor vê de graça é o **comportamento da entrada**.
- **Cuidado com a premissa:** o cliente oficial já manda `input` num timer fixo de 10 Hz (`packages/netcode/src/session.ts`, `sendFrame`), com um envio extra quando a tecla muda (`setControls`). O intervalo entre mensagens `input` é regular para todo mundo e **não** serve de sinal. O sinal está nas **mudanças**: quando `controls` muda e quando `fire` liga/desliga, em relação ao frame do servidor e entre si.
- Por padrão `allowFreeTurning` é falso: a arma segue as teclas de direção (8 direções) e o cliente manda `gundir = 0`. "Virar a arma" é, na prática, mudar a tecla de direção.
- Esses números também servem ao jogador (evolução de precisão) e para achar teclado ou gamepad com defeito.

## Escopo
- Acumular por jogador e por partida, na sala, sem entrar em `packages/sim` nem pesar no caminho quente do `tick`:
  - intervalo entre mudanças de `controls` e entre transições de `fire` (média, desvio, p95, maior sequência com o mesmo intervalo em ms, fase em relação ao frame do servidor);
  - tempo entre a mudança de direção e o `fire` ligado, e a % de casos com chegada no mesmo pacote ou no mesmo ms;
  - tempo (em **ms**, não em frames: o tick é 10 Hz, D-74) entre o inimigo ficar visível na AOI do jogador e o próximo `fire` ligado — só transições desligado→ligado; tiro segurado não conta como reação;
  - precisão (`hits/shots`), % de tiros com a arma já alinhada ao alvo (só com `allowFreeTurning`), duração, quedas e reconexões.
- Persistir junto do relatório da partida (`match-report.ts`) e da API: coluna JSON em `match_players` ou tabela `player_telemetry`, sempre numa **migração nova**; só jogadores com conta (bots e convidados fora, como nas estatísticas).
- Endpoint admin: telemetria de uma partida e agregado por jogador nos últimos N dias.
- Fixture reutilizável de "cliente automático" (muda tecla e tiro exatamente na grade de 100 ms, reage em 0–1 frame) e de "humano sintético" (jitter de teclado, reação de 180–350 ms) para os testes deste card e do OG-436.
- Nada visível ao jogador e nenhuma decisão automática. A página de privacidade (`apps/web/src/screens/legal.tsx`) passa a citar a telemetria e o prazo de retenção.

## Critérios de aceite
- [ ] Partida com 8 jogadores grava a telemetria dos humanos com conta (bots e convidados fora), conferível por um teste de sala.
- [ ] A fixture de cliente automático sai com desvio ~0 na fase das mudanças e reação ≤ 100 ms; a de humano sintético, não. O cliente oficial (timer de 10 Hz) não aparece como automático só pelo envio periódico.
- [ ] O relatório da partida continua válido sem a telemetria (partidas antigas).
- [ ] Sem impacto mensurável no tick (`tools/load` ou o custo por frame do `bot-stats`).

## Notas técnicas
- `room.ts` (`case 'input'` / `case 'fire'`) já vê cada mensagem; medir com um acumulador por `pid` e fechar no fim da partida. Relógio de parede (`this.now()`) só fora da simulação — o `Rng` e o tick continuam determinísticos.
- O tempo de chegada mistura a rede: jitter do TCP/WebSocket entra nos números. Guardar também o ping médio do jogador para o OG-436 poder descontar.
- A API agrega e serve (`apps/api/src/routes/admin.ts`), não o game server.
- **Decisão do PO antes do Pronto:** prazo de retenção da telemetria (sugestão: 90 dias por partida, agregado enquanto a conta existir).
- Motivação: `plan/reports/OG-104-seguranca.md`, seção "Anti-cheat no game server".

## Notas de implementação
—
