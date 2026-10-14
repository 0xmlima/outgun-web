# OG-221 — Trilha sonora no menu e nas partidas

| Campo | Valor |
|---|---|
| Épico | E10 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S13 |
| Status | Pronto |
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
- [ ] Testes do embaralhamento (sem repetição; "Outgun Epic" nunca toca em partida) com RNG injetado.
- [ ] Teste manual registrado de menu → partida → menu com as transições.

## Notas técnicas
- `HTMLAudioElement` com streaming para não decodificar 3 min de áudio na memória; Web Audio só para ganho/crossfade.

## Notas de implementação
(preenchido durante a execução)
