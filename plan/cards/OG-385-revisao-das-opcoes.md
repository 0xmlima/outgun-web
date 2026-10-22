# OG-385 — Revisão das opções do jogo: o que fica, o que sai

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Spike |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S40 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | RN-UI-01, RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero uma tela de Opções curta, só com o que faz diferença hoje, para achar rápido o que procuro.

## Contexto
- Pedido do PO em 2026-10-22: muitas opções são legado do 1.0.3 (rede de 2005, temas antigos, ajustes finos de minimapa) que na prática ninguém usa.
- As opções do jogador ficam na conta (`/account/settings`, OG-068): dá para medir no beta quantas contas mudaram cada uma do padrão.

## Inventário e proposta inicial (para o PO decidir)
Legenda: **Fica** · **Sai** (vale o padrão para todos). **Decisão do PO (2026-10-22):** os "?" ficam como estão; os "Sai" saem (OG-386).

| Aba | Opção | Proposta | Por quê |
|---|---|---|---|
| Jogo | Nome, cores favoritas, cor aleatória | Fica | identidade |
| Jogo | Previsão de lag + quantidade | Fica (PO) | essencial na rede, mas poderia ser automática |
| Jogo | Banda para jogadores fora da sala (cps) | Sai | ajuste de rede de 2005 |
| Jogo | Enviar estatísticas de rede anônimas | Fica | privacidade |
| Jogo | Mostrar latência do input | Fica | diagnóstico (S39) |
| Jogo | Mensagens de bandeira / de abate | Fica | |
| Jogo | Mostrar stats depois da rodada | Fica (PO) | o modal de fim de partida (D-63) já mostra |
| Jogo | Mostrar info do servidor ao conectar | Sai | legado |
| Jogo | Ficar morto num menu no início da rodada | Sai | legado |
| Jogo | Sublinhar jogadores com conta | Fica (PO) | |
| Jogo | Pular mapas na rotação | Fica (PO) | votação nova pode ter substituído |
| Jogo | Bots nas suas salas Casual; mensagens rápidas | Fica | |
| Gráficos | Tema, tema de cores, preferir cores do tema, fundo, preferir fundo do tema | Sai (fica só "Tema", se houver mais de um) | temas legados (D-53) |
| Gráficos | Visual dos menus; escala, estilo e editor do HUD | Fica | v2 |
| Gráficos | Mostrar nomes dos jogadores | Fica | |
| Gráficos | Salas na tela em cada direção | Fica (PO) | |
| Gráficos | Rolagem, menos transparência, texturas contínuas | Fica (PO) | |
| Gráficos | Jogadores sumidos no minimapa; destacar bandeiras devolvidas; bandeiras extra-visíveis; posição de sumiço das bandeiras; destacar a si ao nascer; marcadores de vizinhos; caixa da área visível; vista passa da borda; repetir partes do mapa | Sai (padrão para todos) | ajustes finos do original |
| Gráficos | Destacar mapas que não estão no jogo; transparência da tela de stats; modo info do mapa | Sai | legado |
| Gráficos | VSync, limite de FPS | Fica | S39 |
| Áudio | Trilha, volumes, efeitos | Fica | |
| Áudio | Tema de som | Fica (PO) | só se houver mais de um |
| Servidor | Nomes de bot finlandeses (`bot_name_lang fi`) | Sai | mesmo motivo do OG-384 |

## Escopo
- Medir no beta (uma consulta em `users.settings`) quantas contas mudaram cada opção do padrão; anexar ao card.
- PO marca Fica/Sai em cada linha; o que sair vira um card de execução (tirar da tela e das preferências, migrar o valor salvo para o padrão), sem mexer no HUD da partida (RN-UI-05).

## Critérios de aceite
- [x] Decisão do PO em cada linha (sem medir o uso: o PO decidiu pela tabela).
- [x] Card de execução criado com a lista aprovada (OG-386).

## Notas de implementação
- Decidido pelo PO direto na tabela, sem a medição no beta.
