# OG-338 — Clã escolhe como a tag aparece: (nn), DT-, Dk.

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Melhoria |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S35 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-NOM-03, RN-CLA-03, RN-CLA-05 |
| Skills | `outgun-card-workflow` |

## História
Como líder de clã, quero escolher como a tag aparece junto do nome dos membros, como a comunidade usa: "(nn) Fulano", "DT-Fulano", "Dk.Fulano".

## Contexto
- Pedido do PO em 2026-10-21: a tag era sempre "(TAG) nome".

## Escopo
- Estilos: `(Dk)`, `[Dk]`, `Dk-`, `Dk.`, `Dk|` (`CLAN_TAG_STYLES`); parênteses e colchetes com espaço, os outros colados no nome.
- Migration 0028: `clans.tag_style` (padrão parênteses) e `users.clan_label` (tag decorada), mantidos pelos gatilhos do OG-270; função SQL `clan_label`.
- API: `tagStyle` ao criar e editar o clã (só o líder muda, RN-CLA-03); `tagStyle`/`tagLabel` na página do clã; `clanLabel` no usuário, perfil, ranking, companheiros e lista de jogadores; o ticket leva o rótulo, então chat, HUD e placar mostram o estilo.
- Cliente: escolha com prévia ("Dk.Felix") na criação e na edição; listas do portal com o rótulo.

## Critérios de aceite
- [x] Testes: padrão "(NX)", só o líder muda, estilo inválido recusado, rótulo segue a tag e some ao dissolver; ticket com "(XY)"; `chatName` nos 5 estilos.
- [ ] PO confere: criar/editar com estilo e ver no chat, placar e listas.

## Notas de implementação
- `playerClan` agora leva o rótulo decorado; tag pura (replays antigos) continua aparecendo como "(TAG) nome".
- Links de clã seguem usando a tag pura (`/clans/Dk`).
