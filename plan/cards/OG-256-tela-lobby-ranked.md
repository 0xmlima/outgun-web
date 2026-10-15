# OG-256 — Tela do lobby Ranked: times, voto, "Pronto" e contagem

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S18 |
| Status | Concluído |
| Dependências | [OG-253](OG-253-times-lobby-clas.md), [OG-254](OG-254-voto-pronto-contagem.md), [OG-255](OG-255-lista-salas-ranked-cliente.md) |
| Regras de negócio | RN-RKL-07 a RN-RKL-12, RN-UI-01 |
| Skills | `outgun-card-workflow` |

## História
Como jogador no lobby, quero ver os dois times, trocar de lado, votar no mapa e marcar "Pronto", para saber exatamente quando e onde vamos jogar.

## Escopo
- Tela da sala: dois lados com nome, clã e estado (pronto/não), vagas livres, formato/série e placar da série.
- Ações: trocar de lado, aceitar/recusar pedido de troca, votar (mapas com miniatura e votos), "Pronto"/"Cancelar", sair.
- Contagem de 5 s visível e cancelável; chat da sala.
- Entre jogos de uma série, a tela volta com o placar e o próximo voto.

## Critérios de aceite
- [x] Cada mudança de estado do servidor aparece em ≤ 1 s.
- [x] Funciona de 360 px a telas grandes.

## Notas de implementação
- `screens/RankedLobby.tsx` por cima da partida enquanto `lobbyState.phase !== 'game'` (sessão guarda o `lobbyState`; GameScreen lê a cada 250 ms e desliga os controles do jogo). Vermelho à esquerda, azul à direita, centro com série/fase/voto (miniaturas)/"Pronto"/contagem, chat da sala embaixo; empilha abaixo de 52rem.
- Conferido com a pilha completa (Postgres, API, game server, 6 contas, sala 3x3 com senha): lista → senha errada → lobby → troca de lado → chat → voto → prontos → contagem → jogo.
- Não exercitado: fim de série e volta entre jogos (aparece pelo mesmo `lobbyState`; OG-257 cobre o placar). Clã ao lado do nome fica para o OG-206 (o cliente ainda não recebe a tag).
