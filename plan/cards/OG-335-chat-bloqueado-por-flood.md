# OG-335 — Chat bloqueia na 3ª mensagem e o bloqueio nunca acaba

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S35 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-CHT-02, D-60 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero conversar normalmente; só quem inunda o chat deve ser barrado, e por pouco tempo.

## Contexto
- Achado do beta em 2026-10-21: depois de 2 mensagens o jogador não conseguia mais falar e nunca saía do bloqueio.
- O limiar era o do original (bloqueio na 3ª mensagem seguida, 18 s para esfriar), mas o esfriamento só rodava com o jogo correndo: no lobby do Ranked, na pausa e na troca de mapa o bloqueio não acabava. Cada tentativa bloqueada voltava a temperatura ao máximo. Além disso, 7 caracteres iguais ("kkkkkkkk") eram descartados sem aviso.

## Escopo
- `TalkMeter` novo (D-60): +1 por mensagem, −0,1 por frame; mais de 30 seguidas bloqueia; libera ao esfriar 10 (~11 s); tentar durante o bloqueio não prolonga. Esfria em todo frame do servidor.
- Fim do descarte de caractere repetido.
- Limite de rede do chat no `InputGuard` (10/s, rajada 45) acima do anti-flood, para quem exagera receber "too much talk" e não ser expulso.

## Critérios de aceite
- [x] Testes: 30 seguidas passam, a 31ª bloqueia; 1 por segundo nunca bloqueia; o bloqueio acaba mesmo insistindo; "kkkkkkkk" passa.
- [ ] PO confere no lobby e na partida.

## Notas de implementação
