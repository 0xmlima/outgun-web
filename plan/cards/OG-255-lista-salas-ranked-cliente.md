# OG-255 — Tela de salas Ranked no cliente (lista, criar, entrar)

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S17 |
| Status | Backlog |
| Dependências | [OG-252](OG-252-salas-lobby-ranked.md) |
| Regras de negócio | RN-RKL-05, RN-RKL-06, RN-UI-01 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ao escolher "Ranked" ver primeiro as salas abertas, para escolher onde jogar ou criar a minha.

## Contexto
- `apps/web/src/screens/lobby.tsx` (OG-203) lista Casual/Ranked e hoje leva direto à partida.

## Escopo
- "Ranked" abre a lista de salas Ranked (formato, série, ocupação, fase, cadeado, ping), com filtro por formato; atualização periódica como hoje.
- Criar sala: formato, série e senha opcional. Entrar: pede a senha quando houver; sem conta → login.
- Design system v2 (RN-UI-01).

## Critérios de aceite
- [ ] Fluxo completo por teclado, mouse, toque e gamepad.
- [ ] Sala com senha mostra cadeado; senha errada mostra erro sem sair da lista.

## Notas de implementação
(preenchido durante a execução)
