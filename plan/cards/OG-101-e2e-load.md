# OG-101 — Testes E2E e de carga

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S11 |
| Status | Concluído |
| Dependências | [OG-064](OG-064-prediction-interpolation.md) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como time, quero garantir que fluxos completos funcionam e que o servidor aguenta salas cheias.

## Contexto e referências no original
- Seção 7 do PLAN (RNF).

## Escopo
- Playwright: cadastro → lobby → partida → fim → ranking.
- Clientes headless (Node) que jogam via protocolo para carga: 20 salas × 32 jogadores.
- Simulação de latência/perda.

## Critérios de aceite
- [x] E2E verdes no CI.
- [x] Relatório de carga confirma RNF de tick e tráfego.

## Notas técnicas
- —

## Notas de implementação
- E2E (`tools/e2e`, Playwright 1.63): um teste percorre cadastro → lobby (a sala aparece pelo heartbeat) → "Jogar agora" Casual → partida com 3 bots e ticket de verdade (`DEV_TICKETS=0`) → fim pelo `time_limit 1` → perfil com a partida no histórico → página da partida → ranking da temporada; outro confere que convidado no Ranked vai para o login. 2 de 2 verdes localmente (1,2 min). Job `e2e` no CI com PostgreSQL de serviço, Chromium do Playwright e uma carga de fumaça (2×8 com rede ruim). O ranking em si (deltas do Ranked) segue coberto pelos testes de integração da API (OG-084): pontuar 100 de score numa partida automática não é estável.
- Para o teste saber do fim da partida, a tela do jogo expõe `data-game-over` (como o `data-status` que já existia).
- Carga (`tools/load`): clientes headless pelo protocolo binário em processos separados, com a rede simulada do `packages/netcode` (RTT, jitter, perda com retransmissão) nos dois sentidos; relatório tirado do `/metrics` do OG-102 entre duas coletas. Resultado em `plan/reports/OG-101-carga.md`: 20 salas × 32 jogadores num núcleo com tick de sala p95 ≈ 1 ms, ~21–25% de CPU, 1,3 KB/s por cliente, 0 ticks descartados, com e sem rede ruim. Achado operacional: o tick do processo soma ~0,75 ms por sala cheia (20 salas → p95 15–16 ms, perto do alerta de 20 ms), então ~20 salas cheias por processo é o limite a usar no deploy (OG-103).
- Game server: variável `ROOMS` (salas fixas extras, `id[:preset[:max]]`).
- Correções achadas pelos testes:
  - **Banco novo sem temporada nem salas da plataforma**: só o seed de desenvolvimento criava a Temporada 1 e as salas `main`/`ranked`; em produção o ranking daria 404, o Ranked não teria temporada e o "Jogar agora" não teria sala. Migration `0008_platform_defaults` (reversível, não apaga o que já foi usado) + teste.
  - **Tráfego por cliente subestimado**: os eventos enviados a todos (`flush`) não entravam no `bytes` de cada cliente, que alimenta `outgun_client_bytes_per_second_avg`; corrigido (servidor e clientes agora medem o mesmo: 1,30 × 1,31 KB/s).
  - Faixas de 15 e 30 ms nos histogramas de duração: o p95 do tick do processo caía entre 10 e 20 ms e a interpolação dava 19,7 ms (real: 15 ms).
