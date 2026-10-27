# OG-440 — Evasão de ban: correlação de contas e dispositivos

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Could |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-104, OG-087 |
| Regras de negócio | RN-PLT-05, D-33 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero ver quando um banido volta com outra conta, para o ban valer alguma coisa.

## Contexto
- Já existe ban por conta, IP e hash de dispositivo (OG-104, D-33), e o ticket leva o `dev`. O buraco é a **detecção**: conta nova, dispositivo limpo, mesma rede, mesmo horário, nome parecido — nada disso aparece hoje.
- Hoje o moderador só descobre a reincidência por acaso, na denúncia seguinte.

## Escopo
- No login e na entrada em sala, comparar a conta com bans em vigor e recentes: hash de dispositivo igual, IP igual dentro de uma janela, nome/e-mail muito parecido, mesma sala e faixa de horário.
- Alerta no painel (não bloqueio automático): "possível retorno de X (banido em ...)", com os vínculos, a confiança e o tempo.
- Um clique para estender o ban à nova conta/dispositivo, com motivo e auditoria (`admin_actions`).
- Retenção e privacidade: guardar só o hash (como hoje), prazo de retenção definido, nada visível ao jogador.
- Falso positivo esperado (irmãos na mesma casa/rede) fica como alerta, nunca bloqueio automático.

## Critérios de aceite
- [ ] Conta nova no mesmo dispositivo/IP de uma conta banida aparece como vínculo provável no painel, com o motivo.
- [ ] Um clique aplica o ban na nova conta e registra a auditoria.
- [ ] Dois irmãos na mesma rede geram alerta, não bloqueio.
- [ ] Teste de privacidade: nenhum identificador cru sai da API (só hash truncado, como na D-33).

## Notas técnicas
- `bans` (`user_id`, `ip`, `device_hash`, `expires_at`) e o `dev` do ticket em `packages/tickets`; a correlação roda na API (job ou no login), não no game server.
- Evitar N² no login: índice por `device_hash` e `ip`; janela de tempo configurável.

## Notas de implementação
—
