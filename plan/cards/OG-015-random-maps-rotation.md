# OG-015 — Mapas aleatórios na rotação da sala

| Campo | Valor |
|---|---|
| Épico | E1 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | [OG-011](OG-011-map-generator.md) |
| Regras de negócio | RN-MAP-06, RN-VOT-04 |
| Skills | `outgun-re-spec` |

## História
Como admin de sala, quero `random_map` na rotação, para variar as partidas com mapas gerados na hora.

## Contexto e referências no original
- `src/server.cpp:514-524` (`load_rotation_map` gera `mapgen_<rand()>` a cada vez que o mapa entra).
- Download de mapa pelo cliente no original (o cliente pede o arquivo que não tem).

## Escopo
- Rotação da sala com entradas `random_map` (as settings já leem a linha; o gerador é o OG-011).
- Mandar o texto do mapa gerado aos clientes (mensagem nova no protocolo ou rota HTTP do game server); o cliente web e os bots carregam dele.
- Bloco de `mapgen/` disponível no servidor (ordem alfabética, spec mapgen.md).

## Critérios de aceite
- [ ] Sala com `random_map 3 2` gera um mapa novo a cada vez que ele entra na rotação; humanos e bots jogam nele.
- [ ] Votação e lista de mapas mostram `<Random>` como no original.

## Notas técnicas
- Descoberto no OG-011 (S10): o card do gerador cobre só o port; a entrega do mapa ao cliente é trabalho à parte.

## Notas de implementação
(preenchido durante a execução)
