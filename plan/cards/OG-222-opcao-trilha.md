# OG-222 — Opção para desligar a trilha sonora

| Campo | Valor |
|---|---|
| Épico | E10 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S13 |
| Status | Em revisão |
| Dependências | [OG-221](OG-221-player-trilha.md) |
| Regras de negócio | RN-MUS-04 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero desligar ou ajustar o volume da música sem perder os efeitos sonoros.

## Contexto
- `screens/options.tsx`, `app/prefs.tsx`, `app/prefs-sync.tsx`.

## Escopo
- Opções → Áudio: "Trilha sonora" (liga/desliga) e "Volume da música", separados do volume de efeitos.
- Efeito imediato; salvo nas prefs e sincronizado com a conta como as demais.
- Desligada, nenhuma faixa é baixada.

## Critérios de aceite
- [x] Testes das prefs (padrão ligado, migração de prefs antigas, sincronização).
- [x] Com a trilha desligada, nenhuma requisição de música na aba de rede.

## Notas técnicas
- —

## Notas de implementação
- Prefs novas `musicEnabled` (padrão ligada) e `musicVolume` (0..100, padrão 50) em `app/prefs.tsx`; `parsePrefs` dá o padrão a prefs antigas sem os campos e a valores inválidos, e é o mesmo caminho do `PrefsSync` (conta), então sincronizam como as demais. Testes em `options.test.ts`.
- Opções → Áudio: painel "Trilha sonora" (alternador "Tocar a trilha sonora" + deslizante "Volume da música", passo 5%) acima de "Efeitos sonoros", que mantém volume próprio.
- O `MusicProvider` repassa as prefs ao tocador (`configure`) na hora: desligar faz fade-out e para; ligar começa a faixa do modo atual (se já houve gesto). Volume final = escolha × `MUSIC_MIX` (0,6).
- **Rede** (Chrome headless, 2026-10-14): com `musicEnabled: false`, menu + clique + partida Casual → 0 requisições a `/assets/music/`; ao ligar nas opções → 1 (`outgun-epic`); ←×4 no deslizante → 30%, salvo no navegador; desligar → silêncio.
- Prints: `tools/parity/out/prints/og-222-opcoes-audio-{desktop,celular}.png`.
