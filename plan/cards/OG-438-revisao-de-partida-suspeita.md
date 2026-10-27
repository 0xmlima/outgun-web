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
- O painel já lista denúncias e bans e tem auditoria (`apps/api/src/routes/admin.ts`, `AdminScreen.tsx`), mas não tem onde olhar a partida: o moderador decide no texto da denúncia.
- O relatório da partida (OG-380) e o `ReplayScreen` já existem; falta ligá-los à fila de suspeita (OG-436) e à isca (OG-437).

## Escopo
- No item da fila, "abrir partida": placar, jogadores e a telemetria do suspeito lado a lado com a média da partida (OG-435), com os motivos do score.
- Relatório da partida (OG-380) embutido ou linkado, com os marcadores no mesmo visual; a isca, se houve, aparece como evidência ("atiro na isca no frame N").
- "Ver no replay" abre o `ReplayScreen` no frame do evento, com o jogador destacado.
- Ações no mesmo lugar: advertir (mensagem ao jogador), ban de sala, ban de plataforma (com duração), descartar — usando as rotas admin existentes, com motivo obrigatório e registro em `admin_actions`.
- O estado do item (em análise / aplicado / descartado) acompanha a ação.

## Critérios de aceite
- [ ] Ciclo completo numa partida de teste: fila → relatório → replay no frame → ban com motivo → linha na auditoria → item fora da fila.
- [ ] A tela mostra a evidência que sustenta o score, não só o número.
- [ ] A isca só aparece no painel, nunca para o jogador.
- [ ] Nada de print obrigatório; conferência ao vivo com o PO.

## Notas técnicas
- Reaproveitar `MatchReport`/`ReplayScreen`; sem classe visual nova fora dos tokens (RN-UI-01).
- A rota de replay já é servida por `/gs/replays/*.ogr` (`replayUrl` no relatório).
- Ação de ban já cobre conta, IP e dispositivo (OG-104, D-33); falta o atalho a partir da partida.

## Notas de implementação
—
