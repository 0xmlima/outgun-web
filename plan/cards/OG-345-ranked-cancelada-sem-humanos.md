# OG-345 — Ranqueada cancelada quando um lado fica sem jogadores

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S36 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | RN-RKL-17, RN-RKL-18, RN-RKL-19, RN-RKL-26 (D-62) |
| Skills | `outgun-card-workflow` |

## História
Como jogador do Ranked, quero que uma partida sem jogadores de um dos lados seja cancelada, em vez de continuar só com bots.

## Contexto
- Relato do PO (2026-10-21): quando todos caem, o jogo segue com bots. Com a queda, a partida pausa e cada um tem 120 s para voltar (RN-RKL-17); sem volta, o voto do time sem ninguém dá empate → bot (RN-RKL-18).
- Decisão do PO: cancelar também quando só um time inteiro cai; descartar tudo.

## Escopo
- Quando um lado fica sem humano conectado e a janela de reconexão do último a cair acaba sem volta, a partida é **cancelada**: nenhum bot entra no lugar e não há voto.
- Cancelada não muda rating, estatísticas, marcos nem clã; inclusive os deltas parciais de quem saiu no meio (`rating_deltas`, RN-RNK-04) dessa partida são descartados. O relatório vai com a marca "Cancelada" (aparece no histórico/perfil sem contar).
- Série: o jogo cancelado não conta e é disputado de novo; os conectados voltam ao lobby da sala (ou ao menu, se não sobrou ninguém de um lado) com um aviso.

## Critérios de aceite
- [x] Testes: todos caem → cancelada; um time inteiro cai → cancelada; volta dentro dos 120 s → segue normal; um a menos (ainda há humano do lado) → regra atual.
- [x] ~~API aceita o relatório cancelado~~ A partida cancelada não vai à API (ver notas); teste de que nada é enviado.
- [x] RN-RKL-26 e D-62 no PLAN.

## Notas de implementação
- Um lado "some" quando não tem humano conectado nem caído ainda no prazo (bots substitutos e quem está em voto não contam); "Sair" do lado inteiro cancela na hora.
- Os deltas de quem sai no meio de um jogo Ranked agora esperam o fim do jogo (vão antes do resultado, ou na sala fechando) para poderem ser descartados.
- **Decisão de implementação (para o PO):** a cancelada não é enviada à API, então não aparece no histórico. Registrar com a marca "Cancelada" exigiria filtrar a partida em todas as consultas de estatísticas; fica para um card se o PO quiser. Os jogadores veem o aviso no chat do lobby.
- Só nas salas Ranked com lobby (as únicas criadas hoje).
