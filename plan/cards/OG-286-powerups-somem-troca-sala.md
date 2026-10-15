# OG-286 — Power-ups somem ao entrar numa sala

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Correção |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S22 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-PUP-01..09, RN-VIS-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver os power-ups que já estão na sala em que eu entro, para poder ir buscá-los.

## Contexto
- Achado do PO e da comunidade no beta (2026-10-15): "power-ups aparecendo e sumindo no mapa".
- Ao trocar de sala (ou renascer), o servidor manda `powerupVisible` dos itens da sala nova (`screenChanged`, `apps/game-server/src/room.ts:1884`) na fila do cliente, e a fila vai **antes** do frame no mesmo pacote (`room.ts:1052`).
- O cliente processa os itens e, em seguida, o frame: vê que a sala mudou e apaga **todos** os itens (`packages/netcode/src/session.ts:635`), inclusive os que acabou de receber. Eles só voltam se alguém pegar um ou se um reaparecer ali.
- No original o cliente também esquece os itens ao trocar de sala (`src/clientbase.cpp:486-491`), mas recebe os da sala nova depois.

## Escopo
- Cliente (`session.ts`): ao trocar de sala, apagar só os itens que **não** são da sala nova.
- Teste em `session.test.ts`: `powerupVisible` da sala nova seguido do frame com a troca de sala mantém o item; itens da sala antiga somem.

## Critérios de aceite
- [x] Teste da troca de sala com o item recebido no mesmo pacote.
- [ ] (PO) Entrar numa sala com power-ups no chão: eles aparecem na hora, inclusive ao renascer.

## Notas de implementação
- Na troca de sala o cliente só esquece itens de outras salas; os da sala nova, recebidos antes do frame, ficam. Servidor sem mudança.
