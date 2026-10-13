# OG-067 — Áudio

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S7 |
| Status | Em revisão |
| Dependências | [OG-012](OG-012-graphics-sound-pipeline.md) |
| Regras de negócio | — |
| Skills | `outgun-re-spec`, `outgun-asset-pipeline` |

## História
Como jogador, quero ouvir os sons do original nos eventos certos.

## Contexto e referências no original
- `src/sounds.cpp` (SAMPLE_*), `broadcast_screen_sample` (sons por sala).
- `sound/Visa/`.

## Escopo
- Mapeamento evento → sample; sons por sala (só a sala atual, como no original).
- Volume geral/efeitos, mute (Ctrl+M).
- Desbloqueio de áudio no primeiro gesto do usuário.

## Critérios de aceite
- [x] Todos os SAMPLE_* do original mapeados e tocando.
- [x] Sem atraso perceptível (< 50 ms) entre evento e som.

## Notas técnicas
- —

## Notas de implementação
- Spec: [plan/specs/audio.md](../specs/audio.md). Sem divergências do original.
- **Sim**: `SAMPLES` na ordem de `SAMPLE_*` (o índice é o código da mensagem `sound`) e o hook `screenSample(pid, sample)` nos 15 pontos de `broadcast_screen_sample` (pegar power-up, largar o pior, escudo atingido/perdido, shadow compartilhado, infecção e explosão de deathbringer, fim de turbo/power/shadow). Paridade inalterada (40/44 + 4 externos).
- **Servidor**: manda `sound` para quem está na sala do jogador.
- **Cliente**: `apps/web/src/game/audio/` — `SoundPlayer` (Web Audio, uma voz por sample como `stop_sample` + `play_sample`, volume 0..255 linear, liberação no primeiro gesto) e `SoundEvents` (evento → sample, quiques no máximo a cada 0,2 s por jogador). A sessão passou a avisar quiques da extrapolação e bandeira que passa a ser carregada. Opções "Sons habilitados" e "Volume" (passo 15, padrão 128); Ctrl+M liga/desliga.
- **Cobertura**: teste com os 37 `SAMPLE_*` tocando por algum caminho (`sound-events.test.ts`); o tema Visa não tem `wallhit`, `qwallhit` e `colldam` (mudos como no original; `colldam` cai para `hit`).
- **Atraso**: o som dispara no mesmo tick do evento (0,1 ms) + processamento do Web Audio 5,3 ms (`baseLatency`, `latencyHint: 'interactive'`). A saída do dispositivo soma o atraso do hardware (tipicamente 10–30 ms em alto-falantes; o Chrome automatizado usa uma saída falsa de 200 ms, então essa parte só dá para medir no navegador de verdade). Roteiro: `tools/visual-compare/audio.mjs`.
