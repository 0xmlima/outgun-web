# OG-455 — Painéis e alertas no Grafana Cloud

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S48 |
| Status | Pronto |
| Dependências | OG-452, OG-453, OG-454 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero um painel do servidor do beta e alertas por e-mail no Grafana Cloud, para ver a saúde do jogo de qualquer lugar e saber dos problemas antes dos jogadores.

## Escopo
- Painel novo "Servidor do beta": máquina (CPU, steal, memória, swap, pressão), containers, banco e os logs de erro; o painel do jogo (OG-102) ganha as quedas do OG-454.
- Regras novas (máquina, banco, quedas) junto das do OG-102, testadas com `promtool` no `tools/observability/check.sh`.
- `tools/observability/grafana-cloud-sync.sh`: envia os painéis (API do Grafana) e as regras (ruler do Grafana Cloud, `mimirtool`) com as credenciais de `~/.config/outgun/grafana-cloud.env`.

## Critérios de aceite
- [ ] Painéis e regras enviados por um comando, idempotente.
- [ ] Alertas chegam por e-mail (ponto de contato configurado uma vez no Grafana Cloud).

## Notas de implementação
