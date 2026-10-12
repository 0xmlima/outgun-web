# Spec: render de entidades e efeitos
Card(s): OG-062 · RNs: RN-TIM-05, RN-PUP-07

## Resumo
Como o cliente original desenha, sobre o fundo das salas (render-salas.md), os jogadores, foguetes, bandeiras, power-ups, nomes e os efeitos (explosões, turbo, fumaça e anel do deathbringer, "virou sorvete"), com sprites do tema ou formas procedurais.

## Fonte
- `src/guiclient.cpp:3657-3859` — `GuiClient::draw_playfield`: ordem de desenho e regras de visibilidade.
- `src/guiclient.cpp:3861-3925` — `calculatePlayerAlpha`, `seePropertiesRemotely`, `GuiClient::draw_player` (bandeira carregada, turbo, fumaça, escudo).
- `src/guiclient.cpp:75-77,3322-3334` — explosões ao acertar jogador e parede.
- `src/graphics.cpp:812-862` — `draw_flag`.
- `src/graphics.cpp:1242-1310` — `draw_player`; `1312-1317` — `draw_me_highlight`; `1319-1345` — `draw_aim`.
- `src/graphics.cpp:1349-1393` — `draw_player_dead`, `draw_virou_sorvete`.
- `src/graphics.cpp:1395-1523` — `draw_gun_explosion`, `draw_deathbringer_smoke`, `DeathbringerColorizer`, `draw_deathbringer`, `draw_deathbringer_affected`, `draw_deathbringer_carrier_circle`.
- `src/graphics.cpp:1525-1574` — `draw_shield`, `draw_player_name`.
- `src/graphics.cpp:1576-1720` — `draw_rocket`, `draw_pup` e os sete `draw_pup_*`.
- `src/graphics.cpp:2598-2708` — efeitos (`create_*`, `draw_effects`, `draw_turbofx`).
- `src/graphics.cpp:2726-2750` — `make_db_effect`.
- `src/graphics.cpp:2924-3072` — sprites do tema: escala e composição com mapas de alpha.
- `src/graphics.h:92-99` — tamanhos máximos no mundo; `src/commont.h:285-286` — raios.
- `src/world.h:387-420` — `GunDirection` (0..8 oitavos, 0 = direita, sentido horário; −1 = sem direção).
- `src/colour_def.inc` — cores (`player01..16`, `player_hit`, `player_power_*`, `blood_*`, `pup_*`, `deathbringer_*`, `rocket_shadow`, `power_rocket`, `flag_pole`, `name`, `name_highlight`, `spawn_highlight`, `aim_*`, `ice_cream_*`).

## Settings e constantes
| Nome | Valor | Uso |
|---|---|---|
| `PLAYER_RADIUS` | 15 | Corpo do jogador |
| `GUNPOINT_RADIUS` | 28 | Ponta da arma |
| `ROCKET_RADIUS` / `POWER_ROCKET_RADIUS` | 4 / 6 | Foguetes |
| `SHIELD_RADIUS_ADD` | 9 | Raio do escudo = 15 + 9 |
| `player_max_size_in_world` | 60 | Lado dos sprites de jogador, escudo e morto |
| `rocket_max_size_in_world` | 16 | Lado dos sprites de foguete |
| `flag_max_size_in_world` | 100 | Lado do sprite de bandeira |
| `item_max_size_in_world` | 30 | Lado dos sprites de power-up |
| Opção "Highlight returned and dropped flags" | sim | Bandeira devolvida pisca por 2 s |
| Opção "Make flags extra-visible" | multi-roomed | Setas em volta da bandeira com mais de 1 sala na tela |
| Opção "Highlight self after spawn" | sim | Círculo que encolhe por 0,5 s |
| Opção "Show player names" | (cfg) | Nomes |
| `min_alpha_friends` | 128 | Aliado com shadow nunca some de todo |

## Algoritmo

### Ordem do quadro (`draw_playfield`)
1. Jogadores mortos na tela: sorvete se `frags % 100 == 0 && frags ≥ 100`, senão sprite/mancha de morto; o próprio jogador mostra a contagem de respawn.
2. Bandeiras desaparecidas (opção, desligada por padrão).
3. Power-ups no chão.
4. Rastros de turbo.
5. Bandeiras no chão (base ou largadas): piscam (`flash`) nos 2 s após voltar à base quando `int(fmod(t·15, 3)) == 0`; bandeira de time largada mostra o tempo até voltar (`drop_time + flag_return_delay − t`) se ≥ 3 s.
6. Foguetes; sombra (elipse abaixo) se o ponto `y + raio + 8` ainda está na sala e fora de parede.
7. Jogadores vivos, o próprio time primeiro; o próprio jogador por último, com o destaque de spawn e a mira (só com giro livre).
8. Anel do deathbringer de quem o carrega.
9. Efeitos (explosões, fumaça).
10. Explosões de deathbringer.
11. Marcadores de vizinhos (com 1 sala na tela).
12. Nomes.

### Jogador (`draw_player`)
- Cores: `pc1` = cor do time, `pc2` = cor pessoal (`player01..16`; 16 = desconhecida, desenhada sem arma).
- Acertado: enquanto `hitfx − t > 0` (`hitfx = t_acerto + 0,3`, `clientbase.cpp:820`), as duas cores viram `player_hit + int(Δ·600)` em cada canal, limitado a 255.
- Com power, nos décimos de segundo ímpares (`int(fmod(t·10, 2)) == 1`), as cores (e o sprite) passam a `player_power_team/personal`.
- Com sprite do tema (sprite base + mapa `player_personal` na cor pessoal + `player_team` na cor do time, por cima): girado pela direção da arma, com alfa se < 255.
- Sem sprite: círculo `R = pf(15)` na cor do time e círculo `R·2/3` na cor pessoal; arma = três linhas de `R` a `pf(28)` na direção da arma, a central e duas deslocadas `±1,3` px para dentro.
- Alfa (`calculatePlayerAlpha`): `visibility` do jogador (shadow); aliados no mínimo 128; fora da tela exata (só no minimapa) × 2/3.
- Bandeira carregada: desenhada antes do jogador, no mesmo ponto.
- Turbo: com turbo e acima da velocidade máxima de corrida, a cada 0,05 s um rastro (`draw_player` com alfa `90 − Δ·300` por 0,3 s).
- Deathbringer: dois pontos de fumaça a cada 0,01 s; afetado por deathbringer: 5 círculos na cor do time e 5 na `deathbringer_affected`, raio `pf(15)`, posições aleatórias em ±20, alfa/2.
- Escudo: sprite do tema ou três elipses de raio `pf(24) + aleatório` em cores aleatórias entre a cor do time e o branco.

### Morto
Sprite `dead` (+ `dead_team` na cor do time + `dead_alpha` como transparência), girado; sem sprite, três elipses de sangue `blood_redteam/blueteam` com alfa 90. Sorvete: sprite `ice_cream` ou casquinha (elipse `ice_cream_crisp`) com três bolas e o texto "VIROU SORVETE!".

### Foguete
Sprite `rocket`/`rocket_pow` (+ `_team`), girado na direção. Sem sprite: normal = círculo `pf(4)` na cor do time, sombra elipse `pf(4) × pf(2)` em `y + pf(12)`; power = círculo `pf(6)` alternando `power_rocket`/cor clara do time a cada 1/30 s, sombra `pf(6) × pf(3)` em `y + pf(14)`.

### Power-ups (sem sprite)
- Escudo: escudo de raio 14 em cores aleatórias + círculo `pf(12)` `pup_shield`.
- Turbo: três círculos `pf(12)` (`pup_turbo_1..3`) tremendo (±3, ±4, ±6).
- Shadow: círculo `pf(12)` `pup_shadow`, alfa `55 + tri(fmod(t·600, 400))` (55..255).
- Power: círculo `pf(13)` `pup_power_1` / `pf(11)` `pup_power_2` alternando a cada 1/30 s.
- Arma: quatro círculos `pf(4)` (`pup_weapon_1..4`) girando a 1 volta/s em raio `pf(10)`.
- Megahealth: caixa `pf(11 + v)` com borda e cruz `pf(8 + v)` × `pf(3)`, `v` = triângulo de `fmod(t·15, 10)` (0..5).
- Deathbringer: círculo `pf(12)` `pup_deathbringer` + fumaça.

### Bandeira
Sprite `flag` (+ `flag_team` na cor do time/flash), centrado. Sem sprite: mastro `flag_pole` de `(x − pf(3), y − pf(20))` a `(x + pf(3), y + pf(20))` e pano de `(x, y − pf(18))` a `(x + pf(20), y)` na cor do time (ou flash). Ênfase: quatro triângulos apontando para a bandeira.

### Efeitos
| Efeito | Duração | Desenho |
|---|---|---|
| Acerto em jogador (`gunexplo`) | 0,4 s | 3 circunferências de raio `4 + e + int(Δ·40)` em cor aleatória entre metade da cor do time e o branco |
| Foguete na parede | 0,2 s | 2 circunferências, mesmo raio |
| Foguete power na parede | 0,2 s | 3 circunferências, raio `4 + e + int(Δ·60)` |
| Fumaça de deathbringer | 0,6 s | círculo de raio `3 + 9·(0,6 − Δ)` subindo (`y − pf(96 − r·8)`), alfa `(120 − Δ·200)·alfa` |
| Rastro de turbo | 0,3 s | jogador com alfa `90 − Δ·300` |

### Deathbringer
- Explosão: anel de raio `r(frame)` (linear até 100 no 1º segundo, depois `100 + 800·(t − 1)²`), largura `pf(40)`, brilho que sobe de 14 até 255 nos primeiros 30 px e desce depois (`DeathbringerColorizer`), vermelho ou azul, recortado na sala.
- Anel do portador: disco de diâmetro `2·pf(30)` na cor `deathbringer_carrier_circle`, alfa radial `230 − d·2·230/size` (`make_db_effect`).

### Nome
Texto com borda na cor escura do time, centrado acima do jogador (`y − pf(22) − altura da fonte`), `name_highlight` para o próprio jogador.

## Posição no quadro
Depois de `draw_background` (salas) e antes do minimapa e do HUD.

## Casos de borda
1. Jogador com `gundir` −1 (sem direção, recém-entrado): desenhado sem arma e sem sprite.
2. Cor pessoal desconhecida (16): sem sprite, cor `player_unknown`.
3. Shadow total (alfa 0): não desenha; aliado nunca abaixo de 128.
4. Sombra do foguete não aparece se o ponto cair fora da sala ou em parede.
5. Tema com só parte dos sprites (Grid tem jogador e bandeira; Grass só o morto; Metal tem todos): cada tipo cai no desenho procedural independentemente.

## Divergências intencionais
1. Formas procedurais com antialiasing (Graphics do PixiJS) em vez dos círculos e linhas sem suavização da Allegro.
2. Sprites rotacionados com filtro linear (a Allegro gira por vizinho mais próximo).
3. Sorteios só visuais (cores das explosões, tremor do turbo e do escudo, fumaça) usam `Math.random`; não afetam a simulação nem a paridade.
4. Marcadores de vizinhos, bandeiras desaparecidas e mira do giro livre ficam para o OG-065 (HUD), junto com o minimapa.
Registrado em PLAN seção 12 (D-14).

## Vetores de teste
- Cor de acerto: `player_hit` (#464646 de fábrica) com Δ = 0,1 s → `0x46 + 60` = `(130, 130, 130)`; com Δ = 0,3 s → `0x46 + 180` = `(250, 250, 250)` (branco no instante do acerto).
- Alfa da fumaça: Δ = 0,3, alfa 1 → `int(120 − 60) = 60`.
- Raio do deathbringer: 5 frames → 50; 15 frames → `100 + 800·0,25 = 300`.
- Referência visual: replays do oráculo com o tema Metal (todos os sprites) e sem tema (procedural).
