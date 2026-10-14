# OG-065 — HUD: barras, timers, placar, minimapa, chat

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S7 |
| Status | Concluído |
| Dependências | [OG-062](OG-062-renderer-entities.md) |
| Regras de negócio | RN-VIS-02, RN-PAR-02, RN-CHT-01 |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero ver vida, energia, power-ups, placar, tempo, minimapa e mensagens como no original.

## Contexto e referências no original
- `draw_player_health/energy/power/turbo/shadow/weapon`, `draw_map_time`, `draw_scores`, minimapa (`graphics.h:129-190`).
- Mensagens de kill/captura/eventos (`guiclient.cpp`).

## Escopo
- Barras e timers, placar, relógio, minimapa com aliados/inimigos/bandeiras, feed de eventos, chat com histórico (Insert), indicador "Say team".

## Critérios de aceite
- [x] Todos os elementos do HUD original presentes (checklist).
- [x] Mensagens traduzidas (OG-014).

## Notas técnicas
- Texto com contorno como o original (OG-013): `border` em (x−1, y−1) por caractere, avançando pela fonte principal; sem contorno, 8 cópias deslocadas.

## Notas de implementação
- Spec: [plan/specs/hud.md](../specs/hud.md). Decisão D-19 (PLAN seção 12).
- **Checklist do HUD original** (`draw_game_frame`, `draw_map`, `draw_playfield`):
  - [x] Layout da tela (`make_layout`): salas à esquerda, minimapa e placar à direita, barra embaixo; tela baixa encolhe a área de jogo; F12 alterna minimapa e placar.
  - [x] Barras de vida e energia (três faixas de 100), valores; tempos de Power/Turbo/Shadow; "Weapon N"; relógio com limite de tempo ("ET" na prorrogação); FPS.
  - [x] Placar: times com capturas (ou "pings" com Tab), jogadores com cor pessoal clareada, frags/ping, bandeirinha de quem carrega.
  - [x] Minimapa: chão, paredes, bordas, bases pintadas a partir das bandeiras, círculos das bandeiras, névoa por sala (alfa pela idade da posição), salas na tela (com mais de 1 sala), jogadores, eu piscando, bandeiras no chão (piscando ao voltar), bandeiras de quem sumiu da vista (vazadas, 30 s).
  - [x] Mensagens de eventos do original (mortes, sequências de 10, bandeiras, capturas, avisos de tempo, fim de partida, entrou/saiu, mapa) e chat com "Say:"/"Say team:"/"Command:", cursor piscando, 80 s na tela, Insert mostra todas; texto com contorno sobre a área de jogo.
  - [x] Marcadores de vizinhos na borda da área de jogo; destaque ao nascer.
  - [x] Placar de fim de partida ("RED TEAM WINS", "SCORE a - b") e "Waiting game start - next map is"; "Server not responding" após 1 s sem pacote.
  - Fora deste card: "CHANGE TEAMS"/"EXIT MAP" piscando (OG-044/045 ligam os pedidos), "Loading map: N bytes" (mapas vêm do próprio cliente; download pelo CRC no OG-045), mira do giro livre (o cliente web ainda não tem modo de mira por mouse), painel de depuração F9 (F9 é captura de tela, D-15).
- **Servidor**: `scoreUpdate`, `mapTime` (entrada, início de partida, prorrogação), `powerupTimer` e `weaponChange` por jogador, repasse do chat (até 200 caracteres imprimíveis; `.` = time; `/` fica para o OG-046).
- **Cliente**: `packages/netcode` guarda placar, tempos, arma, posição do minimapa e quando cada jogador foi visto, pings; `apps/web/src/game/hud/` (`screen-layout`, `feed`, `minimap`, `hud-renderer`, `online-hud`).
- **Achado do OG-062 corrigido**: o `BitmapText` do PixiJS escalava as fontes bitmap para o tamanho padrão do estilo (26 px): nomes e textos saíam 1,6× maiores que no original. O `DrawList` agora usa o tamanho nativo da fonte.
- **Traduções**: o catálogo do 1.0.3 só tem as mensagens de bandeira sem os códigos de cor (o original as mostrava em inglês); usa-se a tradução sem cor e o pt-BR ganhou as versões com cor.
- Prints: `tools/visual-compare/hud.mjs` → `tools/parity/out/prints/og065-*.png` (1024×768 e 1280×720, pt-BR e inglês).
