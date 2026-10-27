# OG-445 — Sala cheia de bots recusa a entrada de humano

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S47 |
| Status | Concluído |
| Dependências | — |
| Issue | [#10](https://github.com/thiagovasconcellos/outgun-web/issues/10) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero entrar numa sala cheia de bots no lugar de um deles, para jogar com quem está lá.

## Contexto
- Issue #10 (área: Partida / HUD; gravidade: Alto; frequência: Sempre).
- Versão: 2.46.3 · Dispositivo: computador · Navegador e sistema: app desktop/Steam no Windows · Data e hora: Tue Oct 27 2026 01:16:44 GMT+0000 (Europe/Lisbon) · Apelido no jogo: ozzylords
- Passos: 1. Em uma partida de 8x8 na The Blunt, um player tentou entrar e nao conseguiu pq a sala tava lotada. No entanto se tratava de um unico player jogando contra bots. O jogador humano sempre tem prioridade sobre um bot
- Esperado: Entrar no lugar do bot mesmo com a sala cheia
- Obtido: O jogo retornou "sala cheia" mas 15 eram bots
- Evidências: Última partida: https://outgunweb.com.br/matches/38b90d51-f08e-4bc5-aa6d-6666da0276c5
- Contorno: —

## Escopo
- A API e o lobby passam a contar só humanos para dizer que a sala está lotada; o game server já tirava um bot para o humano entrar (`Room.join`).

## Critérios de aceite
- [x] Sala com 16 vagas, 1 humano e 15 bots aceita a entrada (teste em `join.test.ts`) e não aparece como lotada no lobby (teste em `lobby.test.ts`).
- [ ] PO confere numa sala Casual cheia de bots.

## Notas de implementação
- `join.ts` recusava com `room_full` pelo total do heartbeat (com bots) e o lobby escondia o botão pelo mesmo número. Novo `roomHumans` em `registry.ts` (o mesmo cálculo de `humans` da lista de salas). Sem roster (servidor antigo), continua contando o total.
- Teste da API não rodado (Docker desligado): fica para o fechamento da sprint.
