# OG-341 — Ranked com 20 minutos e prorrogação de 5 em caso de empate

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S36 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-MOD-04, RN-RKL-25 (D-61) |
| Skills | `outgun-card-workflow` |

## História
Como jogador do Ranked, quero partidas com duração fixa, para saber quanto tempo cada jogo vai levar.

## Contexto
- Pedido do PO (2026-10-21). Hoje o preset Ranked herda do Clássico `capture_limit 8` e `time_limit 0`: o jogo só acaba com 8 capturas.
- O servidor já tem prorrogação (`extra_time`, `extraTimePeriods`, `sudden_death`, `packages/sim/src/world/server.ts`). Empate já existe na série, no rating e no clã (`packages/settings/src/ranked.ts`).

## Escopo
- Overrides do preset `ranked` (`packages/settings/src/presets.ts`): `time_limit 20`, `extra_time 5`, `sudden_death 0`, um período; `capture_limit 8` explícito. O preset continua travado (RN-MOD-04): nem dono nem `/set` mudam.
- Aos 20 min: quem estiver na frente vence. Empate: +5 min. Na prorrogação o jogo **não** acaba no próximo ponto; acaba com 8 capturas ou aos 25 min. Empatado aos 25 → empate.
- Relógio do HUD e mensagem de regras ao entrar mostram 20 min e "prorrogação de 5 min" (textos que já existem, `feed.ts`).

## Critérios de aceite
- [x] Testes do preset (valores e trava) e da sim: vence o líder aos 20; empate → prorrogação; captura na prorrogação não encerra; 8 capturas encerram; empate aos 25.
- [x] RN-RKL-25 e D-61 no PLAN.
- [ ] PO confere numa ranqueada (pode ser com `time_limit` curto pelo painel de teste).

## Notas técnicas
- Pausa tática e pausa de queda não contam tempo (RN-RKL-15/17): conferir que o relógio da prorrogação respeita.
- Casual não muda.

## Notas de implementação
- Só o preset mudou: a sim já fazia prorrogação sem morte súbita (`checkTimeLimit`). Ao entrar e no fim de cada jogo o chat diz "EMPATE NO FIM: 5 MINUTOS DE PRORROGAÇÃO".
- Teste rápido no beta: Casual com `/set time_limit 1` e `/set extra_time 1` reproduz o fluxo (o Ranked é travado).
