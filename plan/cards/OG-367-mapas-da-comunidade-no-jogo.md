# OG-367 — Mapas do painel nos servidores, nas rotações e no cliente

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S38 |
| Status | Em revisão |
| Dependências | OG-366 |
| Regras de negócio | D-69, D-70 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero jogar os mapas que a moderação publicou sem esperar uma versão nova do jogo.

## Escopo
- A configuração do heartbeat leva os mapas do painel (nome + CRC); o game server baixa da API o texto que ainda não tem, valida e passa a aceitá-los nas rotações e salas, e serve o texto em `/maps/<nome>.txt`.
- O cliente carrega do game server o mapa que não está nos assets (como já faz com os gerados).
- Os mapas do painel entram no catálogo das rotações e na escolha de mapas da sala privada.

## Critérios de aceite
- [x] Teste do game server: mapa do painel chega, entra na rotação e é servido; CRC diferente é recusado.
- [x] Teste do cliente: mapa fora do manifesto é baixado do game server.

## Notas de implementação
- API: a configuração do heartbeat leva `maps` (nome + CRC dos mapas ativos) e entra no hash da versão.
- Game server: `PanelMaps` (`apps/game-server/src/panel-maps.ts`) baixa `GET /maps/:name` da API, confere parser e CRC e guarda em memória. O painel só aplica as rotações depois do download; se algum falhar, aplica sem ele e tenta de novo no próximo heartbeat. A busca de mapas do `main` é pasta + moderação (spawner, painel e salas fixas); `/maps/<nome>.txt` serve o texto em Latin-1; o replay leva o texto do mapa (como nos gerados).
- Cliente: `loadMap` foi para `game/map-loader.ts`; fora do manifesto, baixa do game server (byte a byte, sem o windows-1252 do TextDecoder); o espectador ao vivo também. Sem prévia do mapa no lobby/relatório para mapas da moderação (a prévia lê os assets).
