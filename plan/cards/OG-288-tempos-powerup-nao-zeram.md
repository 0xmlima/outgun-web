# OG-288 — Tempos de shadow, turbo e power não zeram no cliente ao perder o item

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Correção |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S22 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | RN-PUP-01..09, RN-VIS-01 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que a barra de tempo e a visão do minimapa do shadow acabem quando eu perco o item, para não achar que ainda vejo os inimigos.

## Contexto
- Achado do PO no beta (2026-10-15): "o ghost (shadow) não permite ver o carrier da bandeira no mapa".
- Regra do original: com shadow, o minimapa fica sem névoa e o servidor manda todos os inimigos sem shadow **e todo portador de bandeira**. A v2 faz o mesmo no servidor (`apps/game-server/src/aoi.ts:59`, com testes).
- O defeito está no cliente: `powerupEnd` (`packages/netcode/src/session.ts:131`) só muda com `powerupTimer` e nunca volta a zero. O original zera os tempos quando o próprio jogador aparece no frame sem turbo, sem power ou com visibilidade 255 (`src/clientbase.cpp:553-559`): por exemplo, ao morrer ou quando o servidor descarta o pior item.
- Efeito: depois de morrer com shadow, a barra continua contando e o minimapa continua sem névoa, mas o servidor já não manda os inimigos. Parece que o shadow "não mostra o portador".

## Escopo
- `session.ts`: no frame, para o próprio jogador, zerar `powerupEnd.turbo` sem turbo, `powerupEnd.power` sem power e `powerupEnd.shadow` com visibilidade 255.
- Testes em `session.test.ts`.

## Critérios de aceite
- [x] Testes: morrer com shadow, turbo ou power zera o tempo correspondente.
- [ ] (PO) Morrer com shadow: a barra some e a névoa do minimapa volta; com shadow ativo, o portador da bandeira inimiga aparece no minimapa.

## Notas de implementação
- Igual ao original: zera pelo próprio jogador no frame (sem turbo/power, visibilidade 255). Durante o pisca do spawn protegido (128/220) o shadow não zera até a proteção acabar, como no original.
