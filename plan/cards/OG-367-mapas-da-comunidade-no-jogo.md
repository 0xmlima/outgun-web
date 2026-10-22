# OG-367 — Mapas do painel nos servidores, nas rotações e no cliente

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S38 |
| Status | Pronto |
| Dependências | OG-366 |
| Regras de negócio | D-69, D-70 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero jogar os mapas que a moderação publicou sem esperar uma versão nova do jogo.

## Escopo
- A configuração do heartbeat leva os mapas do painel (nome + CRC); o game server baixa da API o texto que ainda não tem, valida e passa a aceitá-los nas rotações e salas, e serve o texto em `/maps/<nome>.txt`.
- O cliente carrega do game server o mapa que não está nos assets (como já faz com os gerados).
- Os mapas do painel entram no catálogo das rotações e na escolha de mapas da sala privada.

## Critérios de aceite
- [ ] Teste do game server: mapa do painel chega, entra na rotação e é servido; CRC diferente é recusado.
- [ ] Teste do cliente: mapa fora do manifesto é baixado do game server.

## Notas de implementação
(preenchido durante a execução)
