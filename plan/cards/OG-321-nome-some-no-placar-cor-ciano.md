# OG-321 — Nome do jogador some no placar (cor ciano)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S30 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver meu nome no placar sempre, qualquer que seja a minha cor.

## Contexto
- Relato do PO em 2026-10-20: às vezes o jogador entra e o nome dele some, nos três estilos de HUD (Clássico, Moderno, Personalizado). Só acontece com a cor ciano.
- Captura (tema gráfico Clássico, HUD Clássico): na coluna do Time Vermelho a primeira linha tem 1 frag e **nenhum nome**; as outras linhas (`[Sk] Slim` sublinhado, `BOT Yxe`, `BOT Rawna`) aparecem com a cor certa.
- Análise inicial (só leitura): o placar desenha `s.names.get(pid) ?? ''` e `text()` sai cedo com texto vazio (`hud-renderer.ts:206`), então a linha sem nome indica que o **cliente não tem o nome desse pid**, e não que o texto ficou invisível: a cor do ciano no placar sai `#28FFFF`, legível. Nada no desenho nem no `ColorPool` trata o ciano de forma diferente.
- Pistas a seguir: (1) ordem das mensagens na entrada quando há bots e o servidor move/troca o jogador de vaga logo depois (`movePlayer`/`swapPlayers` → `teamChange`, que no cliente leva o nome de `from` para `to`, `packages/netcode/src/session.ts:516`); a cor favorita entra aqui porque `settle` reatribui a cor e o `favoriteColors` chega logo após o `welcome`; (2) `playerClan` antes do `playerJoined` (nome vazio até o `playerJoined`); (3) na volta por `resume`, o próprio nome não é reenviado (`welcomeMessages` pula o próprio pid).

## Escopo
- Reproduzir num teste (sala com bots, jogador com ciano entre as favoritas, entrada com troca de vaga) e corrigir a causa, no servidor ou na sessão do cliente.
- Garantir que o próprio nome esteja na sessão também depois de `resume`.

## Critérios de aceite
- [x] Teste que reproduz o nome vazio e passa com a correção.
- [ ] Placar e nome sobre o boneco aparecem para o jogador com ciano nos três estilos de HUD; `visual:check` sem diferença (RN-UI-05).

## Notas técnicas
## Notas de implementação
- Causa: jogador com conta que recarrega a página (ou abre outra aba) dentro do tempo de reconexão volta à mesma vaga pelo `resume` (pela conta, sem token), com frags e time guardados, mas numa sessão nova do cliente; `welcomeMessages` pula o próprio pid, então o cliente nunca recebia o próprio nome nem o clã (linha do placar com frags e sem nome, e sem nome sobre o boneco). A cor não entra na causa: provavelmente quem relatou é o jogador do ciano.
- Correção: `resume` manda `playerName` e `playerClan` do próprio jogador depois do `welcome` (sem `playerJoined`, que anunciaria uma entrada no feed). Teste em `idle.test.ts` com uma `ClientSession` de verdade: falha sem a correção e passa com ela.
- Só muda o que chega ao cliente; nada no desenho do HUD (RN-UI-05), então o `visual:check` fica para o fechamento.
