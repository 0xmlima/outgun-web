# OG-312 — Containers endurecidos, limites de memória e rede segmentada

| Campo | Valor |
|---|---|
| Épico | E14 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S30 |
| Status | Backlog |
| Dependências | [OG-308](OG-308-banco-menor-privilegio.md) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como operador, quero que um container comprometido ou descontrolado não derrube nem alcance o resto, para o jogo seguir de pé numa VM de 1 GB.

## Contexto
Auditoria de segurança de 2026-10-16 (`plan/reports/S29-auditoria-seguranca.md`), guiada pelo OWASP Cheat Sheet Series: Docker Security, NodeJS Docker, Network Segmentation, Denial of Service.

Achados: nenhum container com `cap_drop`, `no-new-privileges` ou limite de memória (numa VM de 1 GB, um vazamento de memória derruba tudo); o cliente web (Caddy) roda como root; todos na mesma rede, então borda e cliente web alcançam Postgres e Redis.

## Escopo
- `cap_drop: [ALL]` (+ `NET_BIND_SERVICE` na borda), `security_opt: no-new-privileges`, `read_only` com `tmpfs` onde der.
- Limites de memória e CPU por serviço, somando abaixo de 1 GB com folga.
- Caddy do cliente web como usuário sem privilégio.
- Redes separadas: borda ↔ web/game server; web ↔ API; API/game server ↔ Postgres/Redis.
- Varredura das imagens (trivy) no CI.

## Critérios de aceite
- [ ] `docker inspect` mostra capabilities, limites e usuários novos.
- [ ] Borda e web não alcançam Postgres/Redis (teste).
- [ ] Jogo funcionando após o deploy.

## Notas técnicas
## Notas de implementação
