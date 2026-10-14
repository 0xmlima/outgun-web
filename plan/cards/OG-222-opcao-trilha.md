# OG-222 — Opção para desligar a trilha sonora

| Campo | Valor |
|---|---|
| Épico | E10 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S13 |
| Status | Em andamento |
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
- [ ] Testes das prefs (padrão ligado, migração de prefs antigas, sincronização).
- [ ] Com a trilha desligada, nenhuma requisição de música na aba de rede.

## Notas técnicas
- —

## Notas de implementação
(preenchido durante a execução)
