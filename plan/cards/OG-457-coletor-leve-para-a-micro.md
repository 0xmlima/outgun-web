# OG-457 — Coletor leve para a E2.1.Micro (Fluent Bit no lugar do Alloy)

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-452 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero as métricas e os logs do beta no Grafana Cloud mesmo na VM de 1 GB, para não depender do upgrade da máquina.

## Contexto
- O Alloy (OG-452) não coube na E2.1.Micro. O binário tem 571 MB; com limite de 160 MB ele relia o próprio programa do disco (51 MB/s), e a VM foi a 70% de CPU roubada. Está parado; o resto do OG-452 a OG-455 (configuração, painéis, regras) serve para qualquer coletor que mande as mesmas séries.
- Se o beta for para a A1 (até 4 OCPU e 24 GB no Always Free), basta ligar o Alloy com `deploy/vps/grafana-cloud.sh` e este card pode ser cancelado.

## Escopo
- Fluent Bit (binário de ~15 MB): entrada `node_exporter_metrics` e `prometheus_scrape` (`/metrics` do jogo e da API, e um `postgres_exporter` pequeno em container próprio), saída `prometheus_remote_write` e `loki` com os logs dos containers. Mesmos rótulos (`job`, `instance`, `host`, `service`, `level`) que os painéis e as regras do OG-455 esperam.
- Medir no beta antes de deixar ligado: abaixo de 40 MB de RAM e 2% de CPU, sem leitura contínua de disco.

## Critérios de aceite
- [ ] Métricas do jogo, da API, da máquina e do banco e os logs chegam ao Grafana Cloud.
- [ ] Nenhum aumento perceptível de CPU roubada, swap ou espera de disco na VM.

## Notas de implementação
