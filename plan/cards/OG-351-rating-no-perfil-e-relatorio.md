# OG-351 — Rating do OpenSkill no perfil e no relatório da partida

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S37 |
| Status | Concluído |
| Dependências | OG-349 |
| Regras de negócio | RN-SKL-04, RN-SOC-02 (D-65) |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver meu rating no perfil e quanto ganhei ou perdi em cada partida, com o motivo, para entender o que me faz subir.

## Escopo
- **Perfil:** painel do rating com o valor exibido (RN-SKL-04), partidas ranqueadas e "em calibração" nas primeiras 10. O gráfico de evolução passa a mostrar o rating do OpenSkill (no lugar de score/neg por temporada).
- **Relatório da partida e modal de fim de partida (OG-344):** variação de cada jogador com conta e a chance de vitória prevista, ex.: "+77 · vitória contra time favorito (79%)". Partidas anteriores à implantação não mostram variação.
- **Botão "i"** (OG-342): texto reescrito para o OpenSkill — μ, σ, valor exibido, vitória/derrota/empate contra a força do adversário, um rating único e permanente, começa em 0 e sobe à medida que o sistema conhece o jogador; o que não conta (Casual, canceladas). pt-BR e inglês.
- Design system v2; nada dentro da partida muda (o modal de fim é fora do HUD).

## Critérios de aceite
- [x] Perfil com e sem rating (conta nova, em calibração, calibrada).
- [x] Relatório e modal mostram a variação de quem jogou depois da implantação.
- [x] "i" acessível por teclado e leitor de tela (mesmo `Dialog` do OG-342).
- [x] PO aprova o texto.

## Notas de implementação
- Perfil: selo "Rating N" (ou "em calibração (n/10)") com o "i" ao lado; o gráfico de evolução mostra o valor após cada ranqueada (`/players/:nome/progress` agora devolve `series: [{at, value}]`, sem as temporadas de score/neg). O campo `ranking` saiu do perfil na API.
- Relatório: coluna "Rating" com "+29 (1629)" por conta e a chance prevista de cada time no placar.
- Modal de fim de partida: busca a partida pela sala (`/rooms/:id/last-match`, como o "Ver relatório") e mostra a minha variação e a chance do meu time; se a API ainda não gravou em ~6 s, não mostra nada.
- O "i" foi reescrito (μ e σ escritos como "mu" e "sigma": os textos ficam em Latin-1).
