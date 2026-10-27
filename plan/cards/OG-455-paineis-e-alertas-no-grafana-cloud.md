# OG-455 — Painéis e alertas no Grafana Cloud

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S48 |
| Status | Concluído |
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
- [x] Painéis e regras enviados por um comando, idempotente.
- [ ] Alertas chegam por e-mail (ponto de contato configurado uma vez no Grafana Cloud).

## Notas de implementação
- Painel novo `servidor-beta.json` (resumo, máquina com steal e PSI, containers, quedas e salas, banco com as queries mais caras, logs) e duas visões de quedas no `outgun.json`. As fontes `prometheus` e `loki` são trocadas pelos uids da stack no envio.
- `outgun-beta.rules.yml`: queda em massa (4 ou mais 1006/1011 num minuto), jogo sem métricas, CPU, steal, memória, swap, disco, OOM e banco; testes no `check.sh`. `mimirtool rules lint` passou nos dois namespaces.
- Pendente: rodar o envio com a stack do PO, apontar o ponto de contato por e-mail e criar a verificação do `/api/health` (README do deploy).
