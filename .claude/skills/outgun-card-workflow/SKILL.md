---
name: outgun-card-workflow
description: Fluxo para pegar, executar e entregar cards do projeto Outgun Web (plan/PLAN.md e plan/cards/). Use sempre que o usuário pedir para trabalhar em um card (ex. "faça o OG-201"), escolher o próximo card, atualizar status do quadro, planejar sprint ou criar/quebrar cards.
---

# Outgun Web — fluxo de cards (v2)

Fonte de verdade: `plan/PLAN.md` (seção 8 metodologia, seção 10 quadro, seção 15 v2) e `plan/cards/OG-NNN-*.md`.

**v2 (desde 2026-10-14):** o port terminou (S0–S12). O jogo agora evolui por conta própria: o original
em `_legacy/` é **referência opcional**, não oráculo. As skills de fidelidade (`outgun-re-spec`,
`outgun-parity-harness`) estão em `.claude/skills-disabled/` e não fazem parte do fluxo.

## Escolher um card
1. Se o usuário não indicou o card: pegue, na seção 10, o card do **sprint atual** com status `Pronto`, prioridade mais alta e todas as dependências `Concluído`.
2. Confira a **Definition of Ready** (PLAN 8.3). Se faltar algo, não comece: aponte o que falta ao usuário.
3. Respeite WIP: no máximo 2 cards `Em andamento` por agente.

## Iniciar
1. Mude o status para `Em andamento` **no cabeçalho do card e na tabela da seção 10** (mesmo commit): `python3 tools/dev/set-status.py NNN "Em andamento"`.
2. Crie a branch `og-NNN-<slug>`.
3. Leia as RNs listadas no card (PLAN seção 6 e 15).
4. Cards de **interface** (épico E8 em diante): siga o design system v2 (`apps/web/src/ui/`, tokens e fonte única do OG-200). Nada de fontes bitmap nem de estilo novo fora dos tokens.
5. Cards de **conteúdo/assets** (temas, mapas, música): siga a skill `outgun-asset-pipeline`.
6. Card que **muda a simulação** (`packages/sim`): registre a mudança como decisão D-NN (PLAN seção 12) com o porquê (ex.: achado do beta) e atualize/regrave os testes que dependiam do comportamento antigo. Comparar com o original é opcional.

## Executar
- Commits: `OG-NNN: <verbo no presente> <o quê>`.
- Mantenha `packages/sim` puro (sem Node/DOM, sem `Math.random` — use o `Rng` injetado).
- Não modifique os arquivos do jogo original (`_legacy/`).
- Rode `bash tools/dev/verify.sh` antes de todo commit.
- Descoberta de trabalho fora do escopo → **novo card** (próximo ID livre, status `Backlog`, linha na seção 10), não aumentar o card atual.

## Entregar
1. Verifique a **Definition of Done** (PLAN 8.4) item a item; marque os critérios de aceite do card (`- [x]`).
2. Preencha "Notas de implementação" no card: decisões, links, prints.
3. Cards de interface: anexe **prints** (desktop e celular quando a tela for responsiva) em `tools/parity/out/prints/` e mostre no relatório.
4. Mude o status para `Em revisão` (card + seção 10). **Agentes nunca movem para `Concluído`** — isso é feito pelo PO/revisor.

## Bloqueio
Status `Bloqueado` + uma linha no card: `> Bloqueado por: <card/decisão> — <motivo>`. Se for uma decisão em aberto (D-NN), avise o usuário.

## Criar ou quebrar cards
- Use o template de PLAN 8.7. IDs da v2 começam em **OG-200**, por épico: E8 (visual e menus) 200–209, E9 (portal e perfil social) 210–219, E10 (trilha sonora) 220–229, E11 (jogabilidade v2, achados do beta) 230–249. Se a faixa esgotar, use o próximo número livre global.
- Cards de 13 pts devem ser quebrados antes de entrar em sprint.
- Toda criação/quebra atualiza a tabela da seção 10 e o total de pontos.
