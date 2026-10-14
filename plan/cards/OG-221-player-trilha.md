# OG-221 — Trilha sonora no menu e nas partidas

| Campo | Valor |
|---|---|
| Épico | E10 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S13 |
| Status | Concluído |
| Dependências | [OG-220](OG-220-pipeline-trilha.md) |
| Regras de negócio | RN-MUS-01, RN-MUS-02, RN-MUS-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ouvir o tema "Outgun Epic" no menu e músicas variadas durante as partidas casuais.

## Contexto
- Áudio atual: `game/audio/sound-player.ts` (efeitos, OG-067).

## Escopo
- Serviço de música separado dos efeitos (canal e volume próprios), vivo entre as rotas.
- Menu: "Outgun Epic" em loop.
- Partida Casual: playlist aleatória com as demais faixas, sem repetir até tocar todas, transição suave (crossfade) entre faixas e ao entrar/sair da partida; continua entre trocas de mapa.
- Espectador ao vivo: mesma playlist do Casual. Ranked e replay: sem música (D-37).
- Respeita a política de autoplay do navegador (começa no primeiro gesto do jogador).
- Música não abafa os efeitos do jogo (mixagem padrão com a música mais baixa).

## Critérios de aceite
- [x] Testes do embaralhamento (sem repetição; "Outgun Epic" nunca toca em partida) com RNG injetado.
- [x] Teste manual registrado de menu → partida → menu com as transições.

## Notas técnicas
- `HTMLAudioElement` com streaming para não decodificar 3 min de áudio na memória; Web Audio só para ganho/crossfade.

## Notas de implementação
- **Tocador** (`app/music/player.ts`, `MusicPlayer`): um só, criado no `MusicProvider` (em `main.tsx`, fora do roteador, então vive entre as rotas). Cada faixa é um `HTMLAudioElement` em streaming; o Web Audio só faz o ganho (`GainNode` por faixa + mestre) e o crossfade de 2,5 s, entre faixas e ao entrar/sair da partida. Sem Web Audio, cai para `audio.volume` sem fade. Volume próprio, separado do `SoundPlayer` dos efeitos, e multiplicado por `MUSIC_MIX` = 0,6 para ficar abaixo dos efeitos.
- **Modos** (`useMusicMode`): `Shell` (todas as telas fora da partida) pede `menu` ("Outgun Epic" em loop). `GameScreen` pede `match` só depois que o `welcome` do servidor diz que a sala é Casual (novo `onRoomMode` em `mountGame`); antes disso e no Ranked fica em silêncio. `SpectateScreen` pede `match` e `ReplayScreen` pede `off` (D-37). Trocas de mapa não interrompem a faixa: o modo segue `match` e a faixa atual continua.
- **Playlist** (`app/music/playlist.ts`): Fisher–Yates com RNG injetado, sem repetir até tocar as nove; a primeira da rodada nova nunca é a última da anterior; "Outgun Epic" (papel `menu`) nunca entra. Testes em `playlist.test.ts` (200 sementes × 5 rodadas).
- **Autoplay:** nada é criado nem baixado antes do primeiro `keydown`/`pointerdown`/`touchend`; aí o `AudioContext` nasce e a faixa do modo atual começa.
- **Teste manual registrado** (2026-10-14, Chrome headless com o servidor de jogo local e `window.__outgunMusic`): menu antes do gesto → nada tocando, 0 requisições; depois do clique → `outgun-epic`; "Jogar agora" → sala `main` (Casual) → `outgun-3` com crossfade; levando cada faixa a 3 s do fim → `outgun-3-2`, `outgun-2`, `outgun-2-2` (sem repetir); voltar → `outgun-epic`; `/replay` → silêncio. Sala Ranked não testada ao vivo (exige a API); o caminho é o mesmo do replay (`off`).
- O ligar/desligar e o volume vêm no OG-222 (`configure`); até lá, ligado com volume 0,5.
