# OG-062 — Renderer: entidades e efeitos

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | S6 |
| Status | Concluído |
| Dependências | [OG-061](OG-061-renderer-world.md) |
| Regras de negócio | RN-TIM-05, RN-PUP-07 |
| Skills | `outgun-re-spec`, `outgun-asset-pipeline` |

## História
Como jogador, quero ver naves, armas, foguetes, bandeiras, power-ups e efeitos iguais aos do original.

## Contexto e referências no original
- `graphics.h:127-205` (draw_player, draw_rocket, draw_flag, draw_pup, draw_shield, draw_deathbringer, draw_virou_sorvete, efeitos de explosão/turbo/fumaça).

## Escopo
- Jogadores (cor do time + cor pessoal, arma na direção, hit flash, shield, transparência de shadow, nome).
- Foguetes normais e power, explosões em parede.
- Bandeiras (base, carregada, largada), power-ups animados.
- Efeitos: deathbringer (anel, fumaça), turbo, "sorvete" (morto).

## Critérios de aceite
- [x] Checklist visual aprovado por um veterano do jogo (PO, na revisão da S6).
- [x] Sem queda abaixo de 60 fps com 32 jogadores e 256 foguetes.

## Notas técnicas
- —

## Notas de implementação
- **Spec:** [`plan/specs/render-entidades.md`](../specs/render-entidades.md): ordem de desenho de `draw_playfield`, regras de alfa e visibilidade, cada `draw_*` e os efeitos.
- **Código (`apps/web/src/game/render/`):**
  - `entity-frame.ts`: o que se desenha num quadro (`EntityFrame`, independente da origem: servidor no OG-064, replay no OG-091 ou sim local) e as regras puras do original (cor de acerto, pisca do power, alternância de 1/30 s, alfa do item shadow, variação do megahealth, fumaça, brilho do anel do deathbringer, anel do portador, cor das explosões);
  - `sprites.ts`: sprites do tema compostos como `combine_sprite` (imagem + mapa pessoal + mapa do time com o blender da Allegro; morto com canal alfa de `dead_alpha`). Cada tipo existe ou falta de forma independente: Metal tem todos, Grid só jogador e bandeira, Grass só o morto;
  - `entity-renderer.ts`: PixiJS na ordem do original (mortos → power-ups → rastros de turbo → bandeiras no chão → foguetes → jogadores com bandeira carregada, fumaça, efeito de deathbringer e escudo → anel do portador → explosões → anel do deathbringer recortado na sala → nomes). Sprites e formas se intercalam numa lista de desenho que reaproveita objetos entre quadros;
  - `game/demo.ts`: partida local com a `@outgun/sim` de verdade (preset Clássico) e jogadores de controles aleatórios, para ver tudo antes da conexão (OG-064). Explosões vêm dos callbacks de física (foguete na parede ou no jogador). Teste de carga com `&stress=1`.
- **Achado:** o original troca os raios ao decidir a sombra do foguete (`r.power ? ROCKET_RADIUS : POWER_ROCKET_RADIUS`, `guiclient.cpp:3713`); mantido.
- **Comparação com o original:** replay do oráculo com 12 bots no sisso, sem tema e Metal, mapa inteiro e 1 sala, ao lado da demonstração web. Prints em `tools/parity/out/prints/og062/` (`par-*.png`, `carga-32-jogadores.png`).
- **Desempenho (critério 2):** `tools/visual-compare/fps.mjs`, Chrome com GPU, 1280x960 com densidade 2, coliseu com as 9 salas na tela, 32 jogadores com arma 9 e energia cheia: **60,0 fps, pior quadro 16,8 ms** com Metal e sem tema, com **média de 155 e máximo de 256 foguetes** (limite da sim).
- **Checklist visual para o veterano (critério 1, aprovação do PO):** abrir "Jogar agora" (demonstração no sisso) e conferir, em "sem tema" e no tema Metal (Opções → Tema):
  1. jogador: anel na cor do time, miolo na cor pessoal, arma de três linhas; pisca branco ao ser atingido; alterna branco/ciano com power;
  2. foguetes na cor do time com sombra; power maiores e piscando; círculos de explosão na parede e no jogador;
  3. bandeiras no mastro amarelo (ou engrenagem no Metal), marca brilhante na base, setas com mais de uma sala na tela, bandeira acompanhando o portador;
  4. power-ups: escudo (anéis coloridos), turbo (três círculos tremendo), shadow (magenta pulsando), power (branco/ciano), arma (quatro bolinhas girando), megahealth (cruz vermelha pulsando), deathbringer (círculo escuro soltando fumaça);
  5. mortos (manchas de sangue ou sprite) e "VIROU SORVETE!" aos 100 frags;
  6. deathbringer: fumaça do portador, disco escuro, anel vermelho/azul crescendo, efeito nos atingidos;
  7. rastro do turbo e escudo em volta do jogador;
  8. nomes com borda na cor escura do time, o próprio em amarelo.
- **Divergências (D-14):** formas suavizadas, sprites com filtro linear, sorteios só visuais com `Math.random`. Ficam para o OG-065: marcadores de vizinhos, bandeiras desaparecidas e mira do giro livre.
- **Provisório:** a demonstração desenha o estado da sim a 10 Hz, sem interpolação (o movimento fica em degraus; predição e interpolação são do OG-064). As cores pessoais na demo são `pid % 16` (a escolha de cor é do OG-068). A fonte dos nomes é a dos menus.
- **Testes:** `entity-frame.test.ts` (regras e vetores da spec, blender do `combine_sprite`).
- Branch: `og-062-renderer-entities` (empilhada sobre `og-061-renderer-world`).
