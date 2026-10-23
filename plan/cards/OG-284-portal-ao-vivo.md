# OG-284 — Portal ao vivo: novidades empurradas pelo servidor

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Funcionalidade |
| Prioridade | Could |
| Estimativa | 5 pts |
| Sprint | S42 |
| Status | Concluído |
| Dependências | OG-283 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que o portal mostre o que acontece no jogo no instante em que acontece, para sentir o Outgun vivo.

## Contexto
- Ideia do PO (2026-10-15), passo 2 depois do OG-283 (consultas periódicas). Hoje toda tela pergunta à API de tempos em tempos.

## Escopo
- Canal da API para o cliente (SSE ou WebSocket) com eventos do portal: online e salas (do heartbeat), fim de partida e mudança de ranking, convites de clã.
- Telas inscritas trocam as consultas periódicas pelo canal; consulta periódica fica como reserva se o canal cair.
- Avisos leves no portal (ex. "fulano entrou na sala X"), a definir com o PO.
- Medir conexões abertas no teste de carga e no deploy (proxy, limites da VM Always Free).

## Critérios de aceite
- [x] Online e salas mudam na tela em até ~1 s depois do heartbeat.
- [x] Canal caído: a tela volta às consultas periódicas sem erro visível.
- [x] Teste de carga com N conexões abertas dentro dos limites da VM.

## Notas de implementação
- `GET /live` (SSE, `apps/api/src/routes/live.ts`) só avisa o tópico: `rooms` (heartbeat com salas diferentes), `matches` (partida gravada) e `notifications` (só para a conta, pela sessão). Barramento na memória (`live.ts`, um processo de API), avisos iguais em 250 ms viram um. Comentário a cada 25 s; `LIVE_PER_IP` (20) e `LIVE_MAX_CONNECTIONS` (2000): acima, 503. Fecha as conexões antes de desligar (deploy sem queda). Passa pelos dois Caddy com `encode` (conferido com Caddy 2.10 em Docker).
- Cliente: uma conexão para todas as telas (`apps/web/src/app/live.ts`); `usePolled`/`useApi`, listas de salas e o sino releem no aviso e a consulta vira reserva de 60 s (caído, volta ao ritmo normal).
- Carga (`tools/load/live.mjs`): 1000 conexões ≈ 12 MiB na API; 2500 → 2000 abertas e 500 recusadas (`plan/specs/medicoes/portal-ao-vivo-s42.json`). VM do beta: 952 MB, ~500 livres.
- Pendente do PO: os avisos leves no portal ("fulano entrou na sala X") ficaram de fora; com o canal pronto, viram um card se o PO quiser.
(preenchido durante a execução)
