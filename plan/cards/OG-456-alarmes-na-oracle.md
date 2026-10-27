# OG-456 — Alarmes da Oracle: CPU, memória e máquina fora do ar

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S48 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero um aviso por e-mail da própria Oracle quando a VM do beta passa do limite ou para de mandar métricas, para ter um alarme que funciona mesmo se o servidor inteiro cair.

## Escopo
- `deploy/vps/oci-alarms.sh`: tópico de notificação com assinatura por e-mail e alarmes no Monitoring da Oracle (CPU acima de 80% por 5 min, memória acima de 85% por 5 min, sem métricas por 5 min). Idempotente; só serviços do Always Free.

## Critérios de aceite
- [ ] Alarmes criados na conta do beta, sem nenhum recurso pago.
- [x] Um deploy (pico de 3 a 4 min) não dispara o alarme de CPU.

## Notas de implementação
- O alarme de CPU usa a média do minuto por 5 min: os deploys de 26/10 passaram de 90% só por 3 a 4 min no máximo do minuto. O de "sem métricas" usa `absent()` e é CRITICAL. Repetem a cada 2 h enquanto durarem.
- Pendente: rodar `bash deploy/vps/oci-alarms.sh EMAIL` (a criação na conta da Oracle ficou para o PO) e confirmar a assinatura pelo e-mail.
