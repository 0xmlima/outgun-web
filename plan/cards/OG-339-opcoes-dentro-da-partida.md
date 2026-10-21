# OG-339 — Opções e controles pelo Esc, sem sair da partida

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Melhoria |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S35 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-UI-05, RN-MUS-04 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero mutar a música, mudar o teclado e outras opções pelo Esc, sem sair da partida.

## Contexto
- Pedido do PO em 2026-10-21: o menu do Esc só tinha voltar, relatório, feedback, bots e sair; para mudar controles era preciso deixar a sala.

## Escopo
- Menu do Esc: "Música" e "Efeitos sonoros" (Sim/Não, ←/→), "Controles..." e "Opções...".
- `OptionsBody`: as abas da tela de Opções (Jogo, Gráficos, Áudio, Controles, Idioma) extraídas para abrir também por cima da partida; dentro da partida some o "Editar HUD personalizado" (sairia da sala). Esc ou "Voltar" retornam ao menu; a captura de tecla dos Controles continua usando o Esc para cancelar.
- A sala continua atrás (o jogo não recebe teclas com o menu aberto, como antes); nada do HUD muda de lugar (RN-UI-05).

## Critérios de aceite
- [x] Menu com os atalhos; Opções completas sem sair da sala.
- [ ] PO confere numa partida: mutar a música, trocar uma tecla e voltar ao jogo com a tecla nova.

## Notas de implementação
- Trocar tema de cores ou texturas contínuas remonta o jogo e reconecta (volta à mesma vaga), como já acontecia ao mudar essas opções.
