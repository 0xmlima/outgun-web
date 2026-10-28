# OG-472 — Jogador x jogador: "Comparar comigo" no radar

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S53 |
| Status | Pronto |
| Dependências | OG-471 |
| Regras de negócio | RN-RAD-01, RN-RAD-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero sobrepor meu radar ao de outro jogador, para ver eixo por eixo quem leva vantagem.

## Contexto
- Pedido da comunidade (2026-10-28): gráfico de radar para os stats do jogador, com jogador x jogador, clã e clã x clã. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TEoTQesFht8C9vcPvo4N3u); respostas do PO na D-84.
- PO: todos os cards do radar (OG-469 a OG-479) entram na mesma sprint.

## Escopo
- No perfil de outra pessoa, botão "Comparar comigo" (logado): você em vermelho, o outro em azul, no mesmo período e formato.
- Também dá para escolher outro jogador qualquer para comparar (busca por nome), sem precisar ser você.
- Tabela ao lado: percentil de cada um, barra de vantagem por eixo, arquétipos e número de partidas; resumo "X leva N eixos".
- Amostra pequena de qualquer lado aparece tracejada (RN-RAD-03). Link compartilhável da comparação (os dois nomes na URL).

## Critérios de aceite
- [ ] Comparação aberta pelo link reproduz a mesma tela.
- [ ] Jogador sem radar (menos de 3 ranqueadas) mostra o aviso no lugar da série dele.

## Notas de implementação
