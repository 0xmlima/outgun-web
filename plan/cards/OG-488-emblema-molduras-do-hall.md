# OG-488 — Emblema do clã: molduras do hall da fama (ouro, prata e bronze)

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S51 |
| Status | Em revisão |
| Dependências | OG-482, OG-483 |
| Regras de negócio | RN-EMB-05, RN-CLA-07 |
| Skills | `outgun-card-workflow` |

## História
Como clã que chegou ao pódio, quero uma moldura especial no emblema que mostre a conquista.

## Contexto
- Pedido da comunidade (2026-10-28): identidade visual do clã a partir de uma prancha enviada por um membro. Proposta discutida num artifact (https://claude.ai/artifact/1gbxDv1TRgpon4t9N1yeyF, cópia em `plan/specs/emblema-do-cla/proposta.html`); respostas na D-85.
- PO: todos os cards do emblema (OG-480 a OG-489) entram na mesma sprint.
- P6: "Molduras especiais de acordo com o Hall da fama". O hall de clãs já existe: `season_champions` com `board = 'clans'`, posições 1 a 3 (OG-268).

## Escopo
- Três molduras extras (dourada, prateada, bronze), com acabamento metálico chapado (sem gradiente), liberadas para o clã com pódio no hall de clãs: a da melhor posição já alcançada e as de baixo. Uso opcional.
- API: valida a moldura contra os pódios do clã; editor (OG-483) mostra as bloqueadas com "conquiste o pódio da temporada".

## Critérios de aceite
- [x] Clã campeão usa as três; 3º lugar só a bronze; clã sem pódio não salva moldura de hall (teste).

## Notas técnicas
- **Interpretação a confirmar com o PO na revisão:** a moldura é permanente (o hall é permanente) e vale a melhor posição de qualquer temporada. Alternativa: só na temporada seguinte ao pódio, como as medalhas do "Melhor do mês" (D-79).

## Notas de implementação
- Brasão de três pontas (`hallGold/hallSilver/hallBronze`) com contorno em metal chapado sobre contorno escuro e filete metálico interno; regra em `emblemFrameAllowed` (protocolo), aplicada no `PUT .../emblem` (`emblem_frame_locked`) e no editor (bloqueadas com "Conquiste um pódio no hall da fama de clãs").
- Implementado como **permanente, pela melhor posição de qualquer temporada** (interpretação a confirmar com o PO). Moldura já salva continua valendo.
- Testes: protocolo (campeão/3º/sem pódio) e API (sem pódio recusa).
