# OG-485 — Emblema do clã na identidade do lado, no relatório e no PDF

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S51 |
| Status | Em revisão |
| Dependências | OG-482 |
| Regras de negócio | RN-EMB-04, RN-CLA-09, D-78 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver no relatório da partida o emblema que o clã usava naquele dia.

## Contexto
- Pedido da comunidade (2026-10-28): identidade visual do clã a partir de uma prancha enviada por um membro. Proposta discutida num artifact (https://claude.ai/artifact/1gbxDv1TRgpon4t9N1yeyF, cópia em `plan/specs/emblema-do-cla/proposta.html`); respostas na D-85.
- PO: todos os cards do emblema (OG-480 a OG-489) entram na mesma sprint.
- Hoje a tag e as cores do clã vão no ticket (`apps/game-server/src/tickets.ts`), viram `teamIdentity` e são gravadas em `matches.team_identity` (migração 0039).

## Escopo
- O emblema vai junto da tag e das cores: ticket → game server → `teamIdentity` (protocolo, também no replay) → `matches.team_identity`. Partidas antigas sem emblema mostram o padrão.
- Relatório (`MatchReport.tsx`) e PDF (`report-pdf.ts`): emblema no lugar do quadrado de cor do lado.

## Critérios de aceite
- [x] Trocar o emblema depois da partida não muda o relatório dela.
- [x] PDF com o emblema nítido (vetor no PDF ou raster em alta).

## Notas de implementação
- Caminho: ticket (`clanTeam.emblem`, sempre preenchido, padrão se nunca escolheu) → `TeamIdentity.emblem/colors` no game server → relatório → `matches.team_identity`. O relatório usa o gravado, então trocar depois não muda partidas passadas; partidas antigas mostram o padrão.
- **Pendente para o OG-486:** a mensagem binária `teamIdentity` (protocolo/replay) ainda não leva o emblema; só a partida precisa dele, e é lá que entra.
- PDF: SVG rasterizado em 512 px (`withEmblemImages`) e posto ao lado do nome do lado. Na imagem a tag sai em sans-serif do sistema (o SVG em `<img>` não carrega a Inter da página).
- `EmblemSchema` foi para `routes/schemas.ts` (evita o ciclo clans → players → internal).
