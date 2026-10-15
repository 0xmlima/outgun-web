# OG-265 — Proteção visual da UI da partida: capturas de referência e comparação

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S18 |
| Status | Backlog |
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
- [ ] Referências geradas a partir da `v2` atual, sem nenhuma mudança de UI.
- [ ] Rodar duas vezes seguidas sem mudança dá diferença zero (capturas determinísticas).
- [ ] Uma mudança proposital de 1 px na posição do placar é detectada.
- [ ] Documentado em `DEVELOPMENT.md` (`pnpm visual:check`, `pnpm visual:update`).

## Notas técnicas
- Ocultar ou congelar o que varia (ping, FPS, relógio) só por máscara declarada, nunca mudando o HUD.

## Notas de implementação
(preenchido durante a execução)
