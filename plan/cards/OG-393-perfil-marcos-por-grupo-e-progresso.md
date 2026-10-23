# OG-393 — Perfil no jogo: marcos por grupo, com ícone, progresso, raridade e secretos

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S41 |
| Status | Pronto |
| Dependências | OG-390, OG-395 |
| Regras de negócio | RN-SOC-03, RN-SOC-06 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver no meu perfil dentro do jogo todos os marcos organizados, quanto falta para cada um e quão raro ele é, para saber o que buscar.

## Contexto
- O perfil (`apps/web/src/screens/Profile.tsx`, o mesmo no site, no app instalável e na Steam) mostra uma grade única "Marcos · 4/20". Com ~70 marcos, a grade única não serve.

## Escopo
- Seções por grupo (Progresso, Bandeira, Defesa, Combate, Ranked, Social, Clã, **Secretos**), com o total "N/M" no topo e por grupo.
- Card do marco: ícone (OG-395; cinza quando bloqueado), nome, condição, data (link para a partida) e **% de jogadores que têm** (API: contagem por marco ÷ contas com partida, em cache).
- Marcos de total bloqueados mostram a barra de progresso ("47/100 kills"); a API devolve o valor atual de cada contador.
- Secretos: bloqueado = "Marco secreto · ???", sem condição nem dica; desbloqueado = nome, condição, data, % e "Descoberto primeiro por <jogador>". O topo da seção mostra "N segredos a descobrir".
- Ver o perfil de outro jogador mostra os secretos que **ele** desbloqueou, como qualquer marco (é público, RN-SOC-05).
- Design system v2 (`apps/web/src/ui/`), sem estilos fora dos tokens.

## Critérios de aceite
- [ ] O perfil dentro do jogo (app desktop) e no navegador mostra os grupos, o progresso dos marcos de total e a raridade.
- [ ] Um secreto bloqueado não vaza nome nem condição na resposta da API nem no HTML.

## Notas de implementação
