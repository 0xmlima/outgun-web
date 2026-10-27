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
1. Mude o status para `Em andamento` **no cabeçalho do card e na tabela da seção 10**: `python3 tools/dev/set-status.py NNN "Em andamento"` (aceita vários IDs: `203,205`). Vai no primeiro commit do card, não num commit próprio.
   - **Plane (OG-451):** o quadro do PO é espelhado no Plane. Depois de mudar status, criar cards ou fechar a sprint, rode `node tools/dev/plane-sync.mjs` (só repositório → Plane; chave em `~/.config/outgun/plane.env`, fora do repo). Nunca edite os cards no Plane: o repositório é a fonte de verdade.
2. **Uma branch por sprint** (`sNN`, saindo da `v2`); cada card é uma sequência de commits `OG-NNN: ...` nela (sem branch por card nem pilha). A `main` é a v1 (tag `v1.0.0`, beta): só correções do beta vão nela.
3. Leia só as RNs listadas no card (`grep -n "RN-XXX-NN" plan/PLAN.md`), nunca o PLAN inteiro.
4. Cards de **interface** (épico E8 em diante): siga o design system v2 (`apps/web/src/ui/`, tokens e fonte única do OG-200). Nada de fontes bitmap nem de estilo novo fora dos tokens.
   - **UI dentro da partida** (HUD, placar, overlays): RN-UI-05 — não mover nada do que existe; rode `pnpm visual:check` (OG-265) antes de pôr em revisão, confira numa partida online de verdade e entregue capturas ao PO (exceção à regra de "sem prints").
5. Cards de **conteúdo/assets** (temas, mapas, música): siga a skill `outgun-asset-pipeline`.
6. Card que **muda a simulação** (`packages/sim`): registre a mudança como decisão D-NN (PLAN seção 12) com o porquê (ex.: achado do beta) e atualize/regrave os testes que dependiam do comportamento antigo. Comparar com o original é opcional.

## Executar
- Commits: `OG-NNN: <verbo no presente> <o quê>`.
- Mantenha `packages/sim` puro (sem Node/DOM, sem `Math.random` — use o `Rng` injetado).
- Não modifique os arquivos do jogo original (`_legacy/`).
- **Economia de tokens:** não rode testes, lint nem a suíte durante os cards. Só `pnpm typecheck` do pacote tocado se precisar confirmar uma dúvida. A verificação completa é feita no fechamento da sprint.
- Leia arquivos por trecho (`grep -n` + `sed -n`), não inteiros; não use subagentes nem `/code-review` por card.
- Medições pedidas em critérios (FPS, p95) são feitas uma vez, no fechamento, com script reaproveitável — não a cada iteração.
- Descoberta de trabalho fora do escopo → **novo card** (próximo ID livre, status `Backlog`, linha na seção 10), não aumentar o card atual.

## Entregar
1. Verifique a **Definition of Done** (PLAN 8.4) item a item; marque os critérios de aceite do card (`- [x]`).
2. Preencha "Notas de implementação" no card em **até ~5 linhas**: decisões e pendências (nada de repetir o diff).
3. **Sem prints** (desde a S14): só se o PO pedir uma tela específica. Critérios de aceite que pedem prints não se aplicam.
4. Mude o status para `Em revisão` (card + seção 10) no último commit do card. **Agentes nunca movem para `Concluído`** — isso é feito pelo PO/revisor.
5. Sem relatório por card: uma linha ("OG-NNN em revisão") e segue para o próximo. O relatório é só no fechamento da sprint.

## Fechar a sprint
1. Rode `bash tools/dev/verify.sh` uma vez na ponta da pilha de branches; corrija o que quebrar (commit `OG-NNN: corrige ...` no card culpado ou `Sprint SNN: corrige ...`).
2. Relatório curto ao PO (por card: 1–2 linhas; achados; provisórios; perguntas só de produto).
3. Na aprovação: `git merge --no-ff sNN` na `v2` ("Sprint SNN: ... aprovados pelo PO"); no mesmo commit, status `Concluído` (todos os IDs) e `node tools/dev/version.mjs 2.NN.0` (versão do jogo = sprint, em todos os `package.json`; regerar o `openapi.json` da API); tag `v2.NN.0`, push da `v2` e da tag, apagar a branch `sNN`. Depois do push: `node tools/dev/issues.mjs close --version 2.NN.0` fecha as issues dos cards concluídos com o milestone da versão (é o que o jogador vê como "corrigido na 2.NN.0", OG-431).
4. Atualize a memória com **um** handoff curto da sprint (substitui o da sprint anterior, não acumula).
5. **Changelog (hook):** com a ordem do PO de subir no beta, rode `bash deploy/vps/deploy.sh root@137.131.202.138` (Docker Desktop aberto). O próprio deploy termina mandando o app para a Steam (`apps/desktop/steam/release.sh`: espera o workflow "Cliente desktop" do commit e envia para a branch `beta`; conta em `git config outgun.steamUser`; `SKIP_STEAM=1` pula). Por isso o deploy vem **depois** do push da `v2`. Liberar na `default` continua sendo do PO, pelo Steamworks. Quando terminar, leia a saída com o Bash (se rodou em segundo plano, `tail` do arquivo de saída): o hook `.claude/hooks/changelog-after-deploy.sh` vê o `no ar: https://...`, confere a versão servida e pede o changelog da sprint em formato WhatsApp, em português, para a comunidade. Entregue o texto num bloco de código.

## Bloqueio
Status `Bloqueado` + uma linha no card: `> Bloqueado por: <card/decisão> — <motivo>`. Se for uma decisão em aberto (D-NN), avise o usuário.

## Criar ou quebrar cards
- **Bugs das issues (OG-432):** quando o PO pedir para carregar as issues, `node tools/dev/issues.mjs import --sprint SNN --dry-run` mostra os cards que sairiam; sem `--dry-run` cria os cards (campo Issue, prioridade pela gravidade, 2 pts provisórios), põe as linhas nas seções 9.2 e 10, comenta o card na issue e troca o label `triagem` por `card-criado`. Depois: atualizar o total de pontos e estimar no refinamento. A sprint segue a regra da rodada de correções.
- Use o template de PLAN 8.7. IDs da v2 começam em **OG-200**, por épico: E8 (visual e menus) 200–209, E9 (portal e perfil social) 210–219, E10 (trilha sonora) 220–229, E11 (jogabilidade v2, achados do beta) 230–249. Se a faixa esgotar, use o próximo número livre global.
- Cards de 13 pts devem ser quebrados antes de entrar em sprint.
- Toda criação/quebra atualiza a tabela da seção 10 e o total de pontos.
