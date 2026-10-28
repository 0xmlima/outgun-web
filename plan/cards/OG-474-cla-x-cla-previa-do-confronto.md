# OG-474 — Clã x clã: prévia do confronto com a escalação e radar contra um rival

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S53 |
| Status | Concluído |
| Dependências | OG-473 |
| Regras de negócio | RN-RAD-05, RN-RKL-14 |
| Skills | `outgun-card-workflow` |

## História
Como jogador de clã, quero comparar o estilo do meu clã com o do adversário, para chegar na série sabendo onde cada lado é mais forte.

## Contexto
- Pedido da comunidade (2026-10-28): gráfico de radar para os stats do jogador, com jogador x jogador, clã e clã x clã. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TEoTQesFht8C9vcPvo4N3u); respostas do PO na D-84.
- PO: todos os cards do radar (OG-469 a OG-479) entram na mesma sprint.

## Escopo
- **Prévia do confronto** na série clã x clã (lobby e página da série): os dois radares sobrepostos, cada um com a **mediana de quem está escalado** naquela série (não do clã inteiro, D-84), e a vantagem de cada lado por eixo (diferença menor que 10 = empate).
- Página do retrospecto entre dois clãs: o mesmo comparativo com a mediana geral dos membros (OG-473).
- **Contra um rival:** na página do clã, o radar só das partidas contra um clã escolhido, por cima do radar geral do clã, para ver se o clã muda de jeito contra aquele rival.

## Critérios de aceite
- [x] Prévia muda quando a escalação muda (troca de jogador antes do início).
- [x] Rival com poucas partidas contra o clã mostra "poucos jogos" (RN-RAD-03).

## Notas técnicas
- Interpretação da resposta P5 do PO: "a mediana do clã inteiro deixaria a comparação desproporcional quando um clã joga com os piores", por isso a prévia usa a escalação. Confirmar com o PO na revisão.

## Notas de implementação
- API: `GET /style/lineup?red=&blue=&redClan=&blueClan=` (mediana de cada lado na temporada ativa; com clã, `clanStyle` só dos escalados) e `against=TAG` no `/clans/:tag/style` (só clã x clã contra o rival; `lowSample` abaixo de 10 partidas). A série ganhou `lineup` (contas do último jogo por lado).
- Web: `screens/matchup-radar.tsx` (dois radares + vantagem por eixo, empate abaixo de 10) na página da série; no lobby Ranked entra pelo OG-477, com o mesmo componente (a escalação vem dos nomes do lobby e muda quando alguém troca).
- Retrospecto e rival ficam no painel do clã: escolha do rival entre os adversários e "Nós contra eles" (o clã só contra o rival, por cima do geral) ou "Nós x eles" (mediana x mediana). Não há página própria de retrospecto entre dois clãs.
- `useApi('')` agora não busca (pedidos condicionais). Interpretação da P5 (escalação, não o clã inteiro) a confirmar com o PO.
