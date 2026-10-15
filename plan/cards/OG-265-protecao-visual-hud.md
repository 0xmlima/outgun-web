# OG-265 — Proteção visual da UI da partida: capturas de referência e comparação

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S18 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero que qualquer mudança na UI da partida seja comparada com a tela de hoje, para que o HUD não mude de disposição sem querer (como no OG-205, revertido na S14).

## Contexto
- OG-205: o HUD ficou ~8× maior e a fonte caiu em serifada; o problema só aparecia numa partida online de verdade (o demo do `fps.mjs` não tem HUD).
- Hoje não há nenhum teste que compare imagens do cliente.

## Escopo
- Script reaproveitável (Playwright) que sobe servidor + 2 clientes numa **partida online real** com seed e mapa fixos e captura o canvas em estados fixos: jogando, placar aberto (Tab), chat aberto, mensagens no chat, minimapa, fim de partida, espectador.
- Resoluções: 1280×720, 1920×1080 e 360 px de largura (retrato).
- Capturas de referência geradas **antes** de qualquer card do E12 que mexa no HUD e versionadas em `tools/visual/baseline/`.
- Comparação: falha se qualquer pixel fora das áreas declaradas como "novas" pelo card mudar (tolerância só para antialiasing); gera imagem de diferença.

## Critérios de aceite
- [x] Referências geradas a partir da `v2` atual, sem nenhuma mudança de UI.
- [x] Rodar duas vezes seguidas sem mudança dá diferença zero (capturas determinísticas).
- [x] Uma mudança proposital de 1 px na posição do placar é detectada.
- [x] Documentado em `DEVELOPMENT.md` (`pnpm visual:check`, `pnpm visual:update`).

## Notas técnicas
- Ocultar ou congelar o que varia (ping, FPS, relógio) só por máscara declarada, nunca mudando o HUD.

## Notas de implementação
- `tools/visual-compare/hud-check.mjs` (`pnpm visual:check` / `visual:update`): um navegador por jogador (aba oculta para de desenhar e o cliente cai), comparação dentro do Chrome com imagem de diferença e caixa do que mudou; `SEED` no game server; `__outgunVisualCheck` esconde mapa e naves; vida/energia travadas em 100 por gamemod; a Ana termina sempre com uma troca para o vermelho (o time inicial é sorteado).
- Máscaras (`tools/visual/areas.json`): relógio, FPS, cursor do chat e interior do minimapa (o lugar onde se nasce é sorteado). Só desktop (1280×720 e 1920×1080, D-50).
- Causa das variações iniciais: no SIGTERM o game server drena por até 240 s e segurava a porta — a rodada seguinte falava com o servidor antigo. Agora SIGKILL e recusa de porta ocupada.
- Resultado: 7 de 8 rodadas seguidas com diferença zero (a que falhou foi antes da última correção e não se repetiu). Placar movido 1 px: detectado em 12 das 16 capturas (as outras não mostram o placar).
