# OG-398 — Marcos secretos: os 10 raros, anti-farm, primeiro a descobrir e calibração

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S41 |
| Status | Concluído |
| Dependências | OG-391 |
| Regras de negócio | RN-SOC-06 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero marcos secretos e raros para descobrir jogando, para ter histórias para contar à comunidade.

## Contexto
- Aprovados pelo PO em 2026-10-23 ("adorei todos os secretos, inclua todos"). Meta: cada um com no máximo ~1% dos jogadores ativos.

## Escopo
- Marcos (grupo `secret`, id estável · nome pt/en · condição):
  - `secret_ace` Ás / Ace · matou todos os adversários (3 ou mais), em sequência, sem morrer.
  - `secret_mutual` Empate técnico / Mutual destruction · você e um adversário se mataram no mesmo décimo de segundo.
  - `secret_pacifist` Pacifista / Pacifist · venceu com 2+ capturas e 0 kills.
  - `secret_perfect_hat_trick` Hat-trick perfeito / Perfect hat-trick · 3 capturas numa partida sem morrer.
  - `secret_underdog` Davi contra Golias / David vs Goliath · venceu uma ranqueada com o time desfalcado (`substitutions` com `short` no seu time).
  - `secret_long_haul` Viagem longa / Long haul · 2 min ou mais entre pegar a bandeira e capturar, sem largar.
  - `secret_buzzer` No apagar das luzes / Buzzer beater · captura que desempatou a partida nos últimos 3 s.
  - `secret_kingslayer` Caçador de reis / Kingslayer · 3 portadores de bandeira mortos em 10 s.
  - `secret_roadkill` Atropelamento / Roadkill · kill por colisão.
  - `secret_night_owl` Coruja / Night owl · terminou uma partida entre 3h e 5h (America/Sao_Paulo).
- Anti-farm (RN-SOC-06): só partidas com 4+ jogadores com conta; kills em bot não contam; cálculo só no servidor.
- "Descoberto primeiro por": API devolve, por secreto, o jogador com a menor `achieved_at`.
- `cli.js milestones-calibrate`: conta, no banco, quantos jogadores teriam cada secreto (e % das contas ativas nos últimos 30 dias). Rodar no beta antes do deploy; limite que passar de ~1% é endurecido com o PO.

## Critérios de aceite
- [x] Teste de cada secreto com eventos mínimos, inclusive o caso que quase vale (ex.: Ás com um adversário vivo).
- [ ] Relatório da calibração do beta no card, com a % de cada secreto.
- [x] Partida com 3 contas não concede secreto.

## Notas técnicas
- Empate técnico só existe se o foguete continuar voando depois da morte do atirador; se a calibração der zero, levar ao PO.

## Notas de implementação
- Secretos em `packages/content/src/secret-milestones.ts`, fora do `index.ts`: só a API importa (`@outgun/content/secret`), para nome e condição não irem no JavaScript do cliente. O OG-393 recebe da API o texto de quem desbloqueou.
- Ás: todos os índices do outro time (3+) numa vida e em até 20 s (`ACE_WINDOW`). No apagar das luzes usa o `mapTime` do relatório (segundos truncados).
- `firstDiscoverers` e `cli.js milestones-calibrate` prontos; até o OG-393, relatório e perfil mostram o id cru de um secreto.
- Calibração no beta (2026-10-23, 11 contas ativas em 30 dias): os 14 secretos em 0%; nada a endurecer. Retroativo: 97 marcos em 11 contas.
