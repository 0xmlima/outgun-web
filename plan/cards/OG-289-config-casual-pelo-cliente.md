# OG-289 — Configurar bots da sala Casual pelo cliente (quantidade e nível, inclusive variável)

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S22 |
| Status | Em revisão |
| Dependências | OG-266 |
| Regras de negócio | RN-CFG-03 |
| Skills | `outgun-card-workflow` |

## História
Como dono de uma sala Casual, quero escolher no cliente quantos bots jogam e o nível deles (fixo ou variado), para montar partidas do jeito do meu grupo sem decorar comandos de console.

## Contexto
- Pedido do PO em 2026-10-15. Decisão D-51: só o **dono da sala privada** e **admins** aplicam; as salas públicas oficiais seguem o preset do servidor. A configuração vale **a partir da próxima partida** (reinício ou troca de mapa); o dono também pode reiniciar na hora.
- Hoje o dono já muda regras pelo console (`/set`, `/bot`, `apps/game-server/src/moderation.ts:142`). A quantidade usa `min_bots`/`bots_fill` (`apps/game-server/src/bots.ts:25`).
- Os níveis de 1 a 5 existem desde o OG-266 (`packages/bots/src/skill.ts`), mas o Casual usa sempre o nível de referência (`addBot`, `room.ts:655`).
- A sala privada é criada pela API (`POST /rooms`, `apps/api/src/routes/rooms.ts:148`) com um preset Casual.

## Escopo
- **Settings:** novo `botLevel` (0 = variável, 1–5; padrão = nível de referência, sem mudar o Casual atual). No modo variável, cada bot sorteia o nível ao entrar (`Rng` próprio, sem `Math.random`).
- **Cliente:** seção "Sala Casual" nas opções, salva com as preferências: quantidade de bots (0–31, vira `min_bots` com `bots_fill 0`) e nível (Fraco … Forte, ou Variável).
- **Sala privada:** a tela de criar sala já vem com esses valores e permite ajustar; a API grava as linhas de gamemod da sala, aplicadas desde a criação (`gamemod` das opções da sala).
- **Sala online:** o dono ou admin vê "Aplicar na próxima partida" e "Reiniciar agora" no menu da partida. O servidor guarda a configuração pendente e aplica no próximo reinício ou troca de mapa (como um `/set` adiado); a sala avisa no chat. Outros jogadores não veem a opção.
- Bots que já estão na sala saem e entram de novo com o nível novo no reinício.

## Critérios de aceite
- [x] Testes: `/bot level` (faixa, padrão), sorteio no modo variável com `Rng` fixo e configuração pendente aplicada só no reinício.
- [ ] Testes da API: criar sala privada com bots e nível. (não feito: a rota precisa do Postgres; o `roomSpawn` leva os bots no ticket)
- [x] Jogador que não é dono nem admin não aplica nada (o servidor recusa).
- [ ] (PO) Criar sala privada com 6 bots variáveis: os bots têm níveis diferentes.
- [ ] (PO) Numa sala online como dono: mudar para 2 bots fortes, que aparecem na próxima partida ou ao reiniciar.

## Notas técnicas
- A partida em si (HUD) não muda: as opções ficam no menu do jogo, fora da área da partida (RN-UI-05).

## Notas de implementação
- `bot_level` não entrou no registro de settings (o teste exige só as do original): o nível fica em `settings.server.botLevel` e no console como `/bot level` (dono/admin). Quantidade = `min_bots` fixo (`bots_fill 0`, zera os extras do `/bot add`).
- Protocolo: `casualBots` (c2s 129) e `casualConfig` (s2c 130, só para dono/admin no Casual, habilita os itens no menu Esc). Pendente entra no `nextMap`; os bots presentes trocam de nível.
- API: migration 0027 (`rooms.bots`, `rooms.bot_level`), `bots` opcional no `POST /rooms` e `casualBots` no `spawn` do ticket. Opções: padrão 6 bots, nível 4; na criação dá para desligar ("os bots seguem as regras").
