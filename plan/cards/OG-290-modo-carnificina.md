# OG-290 — Modo Carnificina: power-ups no máximo o tempo todo

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S22 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | RN-PUP-01..09, RN-CFG-01 |
| Skills | `outgun-card-workflow` |

## História
Como jogador do Casual, quero uma sala em que os power-ups caem o tempo todo e duram muito, para partidas caóticas com a comunidade.

## Contexto
- Pedido do PO em 2026-10-15 (D-52). O jogo já tem tudo nas configurações (`pups_min`, `pups_max`, `pups_respawn_time`, `pups_drop_at_death`, `pup_add_time`, `pup_max_time`); falta um preset pronto. O Caos (40–100% das salas, 10 s) é a versão leve.
- O teto do jogo é de **32 itens no mapa ao mesmo tempo** (`MAX_POWERUPS`, do original). Subir o teto mexe na simulação e fica para outro card, se o PO pedir.

## Escopo
- Preset Casual `carnage` ("Carnificina"): `pups_min 32`, `pups_max 32` (o teto em qualquer mapa), `pups_respawn_time 0` (item pego reaparece no frame seguinte), `pups_drop_at_death 1`, `pup_add_time 90`, `pup_max_time 300`.
- Aparece na criação de sala privada (lista de presets Casual) e pode ser usado numa sala pública pelo painel.

## Critérios de aceite
- [x] Teste do preset (valores) e da lista de presets da API.
- [ ] (PO) Criar sala privada "Carnificina": o mapa cheio de itens, que voltam assim que alguém pega; turbo/shadow/power somando 90 s até 5 min.

## Notas de implementação
- Só um preset novo (`packages/settings/src/presets.ts`); sem mudança na simulação. Em mapa pequeno os 32 itens dividem salas (o sorteio aceita sala com item depois de 200 tentativas).
