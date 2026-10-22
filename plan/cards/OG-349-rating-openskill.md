# OG-349 — Rating de habilidade com OpenSkill (Plackett–Luce)

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S37 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-SKL-01..06 (D-65) |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero um rating que meça a minha habilidade pelo resultado das partidas e pela força dos adversários, para que vencer um time mais forte valha mais do que vencer um mais fraco.

## Contexto
- Discussão com a comunidade (2026-10-21/22), página da proposta: https://claude.ai/artifact/CKBe4QGjaDSyspswaE3GQN. Veredito: OpenSkill puro, padrão, permanente, sem decaimento, começando do zero (D-65).
- Antes: card "rating interno para matchmaking futuro" (Could, backlog). Agora o rating é público (perfil, OG-351) e o balanceamento fica para depois (OG-357).

## Escopo
- Biblioteca `openskill` (npm, MIT) com versão fixa, modelo **Plackett–Luce** e **parâmetros padrão** (μ 25, σ 25/3, β σ/2, τ padrão por partida). Sem pesos, sem decaimento por tempo, sem inflar σ na virada da temporada.
- **Um rating por conta**, único para todos os formatos (3x3, 4x4, 5x5) e permanente (não zera por temporada).
- Atualiza a cada ranqueada concluída (`POST /internal/matches`, partida `ranked`, não cancelada): vitória, derrota ou empate (RN-RKL-25). O placar não importa.
- Quem conta (RN-SKL-03, confirmado pelo PO em 2026-10-22): todo humano com conta que começou a partida recebe o resultado do time, mesmo que tenha saído; bot substituto não tem rating e fica fora do cálculo; time com um a menos entra com quem tem.
- Tabelas novas: rating atual por conta (μ, σ, partidas, atualizado em) e histórico por partida (μ/σ antes e depois, chance de vitória prevista). Idempotente por partida (reenvio não aplica duas vezes).
- Todo jogador com conta numa ranqueada participa: não há opção de ficar de fora (RN-SKL-06).
- Começa **do zero** na implantação: nenhuma partida anterior é reprocessada.
- Valor exibido (RN-SKL-04): `max(0, round((μ − 3σ) × 100))`; "em calibração" com menos de 10 partidas. Função única na API, usada pelo perfil, relatório e leaderboard.
- Endpoints: rating da conta (perfil) e variação da conta numa partida (relatório).

## Critérios de aceite
- [x] Testes com os exemplos da proposta (3x3, favorito vence, zebra, empate, novato, um a menos) conferidos contra a biblioteca.
- [x] Partida cancelada, Casual e reenvio do mesmo relatório não mudam o rating.
- [x] Quem saiu no meio recebe o resultado; bot substituto não aparece nas tabelas.
- [x] RN-SKL e D-65 no PLAN; migration reversível; OpenAPI atualizado.

## Notas técnicas
- Ponto de entrada: `apps/api/src/routes/internal.ts` (gravação da partida) e `apps/api/src/ranking.ts` (hoje score/neg).
- O relatório já traz time, conta, bot e substituições (`apps/game-server/src/match-report.ts`).

## Notas de implementação
- `openskill` 5.0.1 (versão fixa) em `apps/api/src/skill.ts`; tabelas `player_skill` e `skill_changes` (migration 0029). Os números da biblioteca batem com os da proposta; só a chance de vitória da página (79%) era aproximada: a biblioteca dá 86% (página corrigida).
- O relatório Ranked leva `skillRoster`: quem está, quem o bot substitui (`replaced`) e quem saiu no meio (`departed`, zerado a cada mapa e na cancelada). Sem o campo (servidor antigo), vale `players`.
- Perfil (`GET /players/:name`) ganhou `skill`; partida (`GET /matches/:id`), `skill` com antes/depois/chance por conta. A tela fica com o OG-351.
- Cancelada não chega à API (OG-345), então não precisa de filtro. OpenAPI regerado no fechamento da sprint.
