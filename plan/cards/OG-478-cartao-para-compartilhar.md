# OG-478 — Cartão do estilo para compartilhar (imagem com radar, arquétipo e clã)

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Could |
| Estimativa | 3 pts |
| Sprint | S53 |
| Status | Concluído |
| Dependências | OG-471 |
| Regras de negócio | RN-RAD-04 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero uma imagem com meu radar e meu arquétipo, para postar no WhatsApp e no Discord e chamar os amigos.

## Contexto
- Pedido da comunidade (2026-10-28): gráfico de radar para os stats do jogador, com jogador x jogador, clã e clã x clã. Proposta discutida com a comunidade num artifact (https://claude.ai/artifact/TEoTQesFht8C9vcPvo4N3u); respostas do PO na D-84.
- PO: todos os cards do radar (OG-469 a OG-479) entram na mesma sprint.

## Escopo
- Botão "Compartilhar estilo" no perfil: gera um PNG (quadrado, legível no celular) com nick, tag e cor do clã, radar, arquétipo, temporada e o endereço do jogo.
- No desktop, salvar o arquivo; no celular, a folha de compartilhamento do sistema quando houver.
- Também para a comparação jogador x jogador (OG-472).

## Critérios de aceite
- [x] Imagem igual em claro e escuro, com o nome do clã e acentos corretos.

## Notas de implementação
- `ui/style-card.ts`: canvas 1080×1080 desenhado à mão (mesma geometria do componente), com cores fixas (iguais em claro e escuro); um jogador na cor do clã, ou a comparação em azul x vermelho. Texto pelo canvas, então acentos e o nome do clã saem como na fonte Inter.
- `shareCanvas`: folha de compartilhar com arquivo quando o navegador aceita (celular); senão baixa o PNG. A resposta do perfil ganhou `clan` (tag, nome e cor primária).
