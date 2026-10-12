# OG-067 — Áudio

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S7 |
| Status | Backlog |
| Dependências | [OG-012](OG-012-graphics-sound-pipeline.md) |
| Regras de negócio | — |
| Skills | `outgun-re-spec`, `outgun-asset-pipeline` |

## História
Como jogador, quero ouvir os sons do original nos eventos certos.

## Contexto e referências no original
- `src/sounds.cpp` (SAMPLE_*), `broadcast_screen_sample` (sons por sala).
- `sound/Visa/`.

## Escopo
- Mapeamento evento → sample; sons por sala (só a sala atual, como no original).
- Volume geral/efeitos, mute (Ctrl+M).
- Desbloqueio de áudio no primeiro gesto do usuário.

## Critérios de aceite
- [ ] Todos os SAMPLE_* do original mapeados e tocando.
- [ ] Sem atraso perceptível (< 50 ms) entre evento e som.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
