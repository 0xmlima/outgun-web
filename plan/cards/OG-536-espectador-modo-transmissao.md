# OG-536 — Espectador em modo transmissão (tela limpa para OBS)

| Campo | Valor |
|---|---|
| Épico | E6 |
| Tipo | Melhoria |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S57 |
| Status | Concluído |
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
- [x] Link de transmissão abre sem barra nem dicas; H alterna.
- [x] Sala da OutCup mostra duplas, fase e placar da série.
- [x] Seguir automático troca para quem pega a bandeira.

## Notas de implementação
- "Copiar link de transmissão" no painel do confronto ao vivo: `/spectate?src=…&copa=<id>&rodadas=N&transmissao=1`. No modo transmissão a barra começa escondida (H alterna), o fim não mostra Voltar e o espectador já segue a bandeira (A alterna; F/Esc desligam).
- Faixa da OutCup (fase, md, duplas e placar da série) em qualquer link com `copa`; o placar só é rebuscado quando o stream começa um jogo novo ou termina, para não adiantar o resultado que a API já sabe.
