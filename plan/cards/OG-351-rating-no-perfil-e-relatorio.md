# OG-351 — Rating do OpenSkill no perfil e no relatório da partida

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S37 |
| Status | Pronto |
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
- [ ] Perfil com e sem rating (conta nova, em calibração, calibrada).
- [ ] Relatório e modal mostram a variação de quem jogou depois da implantação.
- [ ] "i" acessível por teclado e leitor de tela; PO aprova o texto.

## Notas de implementação
(preenchido durante a execução)
