# OG-463 — Nome do clã no lugar de "Time vermelho/azul"

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Could |
| Estimativa | 2 pts |
| Sprint | S50 |
| Status | Concluído |
| Dependências | — |
| Issue | [#19](https://github.com/thiagovasconcellos/outgun-web/issues/19) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como membro de clã, quero que o lado do meu clã apareça com o nome do clã (ex.: "Deep Killers") e não só com a tag, que continua no nome dos jogadores (Dk.coiote).

## Contexto
- Issue #19 (sugestão, baixo). 2.49.1, desktop/Steam no Windows, coiote, sala r-09bhkiof, 3x3 (Duel).
- Hoje (OG-409, S43) o lado que vira clã mostra a **tag** no lugar de "Time vermelho/azul": `teamNames` em `online-hud.ts:314` usa `teamIdentity[n].tag`; o placar usa em `hud-renderer.ts:443` e `:836`.

## Escopo
- `teamIdentity` passa a trazer o nome do clã; o placar e o fim de partida mostram o nome (cortado com reticências se não couber na largura atual do rótulo); a tag fica nos jogadores.
- UI dentro da partida: RN-UI-05 — nada se move; `pnpm visual:check` e capturas ao PO.

## Critérios de aceite
- [x] Lado com cor de clã mostra o nome do clã no placar (TAB) e no fim de partida.
- [x] Nome longo não passa da largura do rótulo de hoje.
- [ ] `visual:check` sem diferença fora do rótulo; capturas ao PO.

## Notas de implementação
- O nome já vinha no `teamIdentity` (protocolo e sessão); `online-hud.ts` passa o nome (ou a tag, se não houver) em `teamNames`. Placar TAB, quadro de fim e "$1 VENCE" usam o nome; o modal de fim de partida também. A pausa continua com a tag (texto curto).
- `fitText` (`hud-renderer.ts`) corta com reticências até caber antes do "capt"/pings (TAB) e antes do placar (quadro de fim). Nada se move.
- `visual:check`: 3 estilos iguais às referências; os cenários não têm clã, então as capturas com nome de clã ficam para o fechamento da sprint.
