# OG-509 — Travou o jogo após acessar The Blunt Mini com as cores do Dk

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts (provisória, estimar no refinamento) |
| Sprint | S54 |
| Status | Em revisão |
| Dependências | — |
| Issue | [#25](https://github.com/thiagovasconcellos/outgun-web/issues/25) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que isto deixe de acontecer: Travou o jogo após acessar The Blunt Mini com as cores do Dk

## Contexto
- Issue #25 (área: Partida / HUD; gravidade: Médio; frequência: Aconteceu uma vez).
- Versão: 2.53.0 · Dispositivo: computador · Navegador e sistema: app desktop/Steam no Windows · Sala / mapa: sala main, mapa The Blunt Mini · Data e hora: Wed Oct 28 2026 20:46:27 GMT-0300 (America/Sao_Paulo) · Apelido no jogo: coiote
- Passos: 1. Travou o jogo após acessar The Blunt Mini com as cores do Dk
- Esperado: jogar
- Obtido: Travou o jogo após acessar The Blunt Mini com as cores do Dk
- Evidências: Última partida: https://outgunweb.com.br/matches/d31b1f62-782b-4bca-a373-cefa07bcf85f
- Contorno: —

## Escopo
- Corrigir a causa; teste que reproduz o caso.

## Critérios de aceite
- [x] O caso da issue não acontece mais (teste).
- [ ] PO confere.

## Notas de implementação
- "Cores do Dk": coiote e Felix (clã Dk, Deep killers) estavam no vermelho na partida anterior (`d31b1f62`), então o The Blunt Mini (`5bff1241`, 23:44–00:20 UTC, só 255 s de jogo) começou com o vermelho como o clã (OG-409/OG-486).
- Causa: o redesenho pelas cores do clã (`host.ts`, fila `queueMap`) recarrega o mapa e cria um `GameMap` novo, e o laço só desenha com `session.world.map === worldMap`. Quando a identidade chegava depois da troca de mapa, a tela congelava até a troca seguinte. Agora o `showMap` reaproveita o objeto da sessão quando o mapa é o mesmo (`sameMapOrLoaded`, teste em `map-loader.test.ts`).
