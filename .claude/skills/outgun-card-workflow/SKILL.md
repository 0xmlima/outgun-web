---
name: outgun-card-workflow
description: Fluxo para pegar, executar e entregar cards do projeto Outgun Web (plan/PLAN.md e plan/cards/). Use sempre que o usuário pedir para trabalhar em um card (ex. "faça o OG-021"), escolher o próximo card, atualizar status do quadro, planejar sprint ou criar/quebrar cards.
---

# Outgun Web — fluxo de cards

Fonte de verdade: `plan/PLAN.md` (seção 8 metodologia, seção 10 quadro) e `plan/cards/OG-NNN-*.md`.

## Escolher um card
1. Se o usuário não indicou o card: pegue, na seção 10, o card do **sprint atual** com status `Pronto`, prioridade mais alta e todas as dependências `Concluído`.
2. Confira a **Definition of Ready** (PLAN 8.3). Se faltar algo, não comece: aponte o que falta ao usuário.
3. Respeite WIP: no máximo 2 cards `Em andamento` por agente.

## Iniciar
1. Mude o status para `Em andamento` **no cabeçalho do card e na tabela da seção 10** (mesmo commit).
2. Crie a branch `og-NNN-<slug>`.
3. Leia as RNs listadas no card (PLAN seção 6) e as referências do original.
4. Se o card for do tipo **Port**: execute a skill `outgun-re-spec` e produza `plan/specs/<tema>.md` antes de codar.
5. Se o card for do épico **E2**: planeje os cenários de paridade (skill `outgun-parity-harness`) antes de codar.
6. Se o card for de **conteúdo/assets**: siga a skill `outgun-asset-pipeline`.

## Executar
- Commits: `OG-NNN: <verbo no presente> <o quê>`.
- Mantenha `packages/sim` puro (sem Node/DOM, sem `Math.random` — use o `Rng` injetado).
- Não modifique os arquivos do jogo original (`src/`, `maps/`, `config/`, `graphics/`...). Patches vão em `tools/parity/patches/`.
- Divergência intencional do original → registrar em PLAN seção 12 e na spec.
- Descoberta de trabalho fora do escopo → **novo card** (próximo ID livre, status `Backlog`, linha na seção 10), não aumentar o card atual.

## Entregar
1. Verifique a **Definition of Done** (PLAN 8.4) item a item; marque os critérios de aceite do card (`- [x]`).
2. Preencha "Notas de implementação" no card: decisões, divergências, links de spec/PR.
3. Mude o status para `Em revisão` (card + seção 10). **Agentes nunca movem para `Concluído`** — isso é feito pelo PO/revisor.
4. Abra o PR listando: card, RNs cobertas, resultado da paridade (quando aplicável), screenshots (cliente).

## Bloqueio
Status `Bloqueado` + uma linha no card: `> Bloqueado por: <card/decisão> — <motivo>`. Se for uma decisão em aberto (D-NN), avise o usuário.

## Criar ou quebrar cards
- Use o template de PLAN 8.7; IDs sequenciais dentro da faixa do épico (E0: 001–009, E1: 010–019, E2: 020–039, E3: 040–059, E4: 060–079, E5: 080–089, E6: 090–099, E7: 100+). Se a faixa esgotar, use o próximo número livre global.
- Cards de 13 pts devem ser quebrados antes de entrar em sprint (ex. OG-048 → OG-048a..e ou novos IDs).
- Toda criação/quebra atualiza a tabela da seção 10 e o total de pontos.
