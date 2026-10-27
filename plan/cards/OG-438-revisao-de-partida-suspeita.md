# OG-438 — Revisão de partida suspeita no painel

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-436, OG-380 |
| Regras de negócio | RN-PLT-05, RN-UI-01 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero abrir a partida suspeita, ver a evidência e agir, para fechar o ciclo denúncia → análise → punição.

## Contexto
- O painel já lista denúncias e bans e tem auditoria (`apps/api/src/routes/admin.ts`, `AdminScreen.tsx`), mas não tem onde olhar a partida: o moderador decide pelo texto da denúncia.
- O relatório da partida (OG-380) e o `ReplayScreen` já existem; falta ligá-los à fila de suspeita (OG-436).

## Escopo
- No item da fila, "abrir partida": placar, jogadores e a telemetria do suspeito lado a lado com a média da partida (OG-435), com os motivos do score.
- Relatório da partida (OG-380) embutido ou linkado, com os marcadores no mesmo visual.
- "Ver no replay" abre o `ReplayScreen` no frame do evento, com o jogador destacado — só quando a partida tem replay (`replayUrl` pode ser nulo); sem replay, o botão some.
- Ações no mesmo lugar, pelas rotas admin que já existem: ban de sala, ban de plataforma (com duração) e descartar — com motivo obrigatório e registro em `admin_actions`. A advertência entra com o OG-439.
- O estado do item (em análise / aplicado / descartado) acompanha a ação.
- Se o OG-437 estiver concluído, o tiro na isca aparece como evidência ("atirou na isca no frame N"); senão, nada muda.

## Critérios de aceite
- [ ] Ciclo completo numa partida de teste: fila → relatório → replay no frame → ban com motivo → linha na auditoria → item fora da fila.
- [ ] A tela mostra a evidência que sustenta o score, não só o número.
- [ ] Partida sem replay abre normalmente, sem o botão de replay.
- [ ] Conferência ao vivo com o PO (sem print obrigatório).

## Notas técnicas
- Reaproveitar `MatchReport`/`ReplayScreen`; sem classe visual nova fora dos tokens (RN-UI-01).
- O replay é servido por `/gs/replays/*.ogr` (`replayUrl` no relatório).
- O ban já cobre conta, IP e dispositivo (OG-104, D-33); falta o atalho a partir da partida.

## Notas de implementação
—
