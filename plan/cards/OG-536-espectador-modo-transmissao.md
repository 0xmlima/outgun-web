# OG-536 — Espectador em modo transmissão (tela limpa para OBS)

| Campo | Valor |
|---|---|
| Épico | E6 |
| Tipo | Melhoria |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-533, OG-535 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como quem transmite a OutCup, quero abrir o espectador numa tela limpa e com o nome do confronto, para capturar direto no OBS sem cortar barras e dicas.

## Contexto
- Sugestão nascida do pedido do PO em 2026-11-01 (transmissão da OutCup). Hoje a barra do espectador mostra "Ao vivo · mapa · atraso · sala" e as dicas de teclas por cima do jogo.

## Escopo
- Parâmetro `?transmissao=1` (e botão "Copiar link de transmissão" na página da OutCup/sala): esconde a barra e as dicas (tecla H mostra/esconde), mantém HUD, minimapa e placar.
- Faixa com o confronto da OutCup (duplas, fase, placar da série) quando a sala é da copa.
- Seguir automaticamente o portador da bandeira (opcional, tecla A), para quem transmite sozinho.

## Critérios de aceite
- [ ] Link de transmissão abre sem barra nem dicas; H alterna.
- [ ] Sala da OutCup mostra duplas, fase e placar da série.
- [ ] Seguir automático troca para quem pega a bandeira.

## Notas de implementação
