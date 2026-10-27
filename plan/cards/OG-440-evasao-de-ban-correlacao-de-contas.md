# OG-440 — Evasão de ban: correlação de contas e dispositivos

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Could |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-104, OG-087 |
| Regras de negócio | RN-PLT-01, RN-PLT-05 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero ver quando um banido volta com outra conta, para o ban valer alguma coisa.

## Contexto
- Já existe ban por conta, IP e hash de dispositivo (OG-104, D-33), e o ticket leva o `dev`. O buraco é a **detecção**: conta nova, dispositivo limpo, mesma rede, mesmo horário, nome parecido — nada disso aparece hoje.
- Hoje o hash do dispositivo só é guardado nos bans e nas denúncias (`bans.device_hash`, `player_reports.target_device_hash`); não há histórico de que conta usou qual dispositivo/IP. Sem esse histórico não há o que correlacionar.
- O moderador só descobre a reincidência por acaso, na denúncia seguinte.

## Escopo
- Tabela nova (migração nova) de vistas por conta: conta, hash do dispositivo, IP, primeira e última vez — gravada no join (`apps/api/src/routes/join.ts`), que já recebe o `dev`. Retenção com prazo.
- No join, comparar com bans em vigor e recentes: mesmo hash de dispositivo, mesmo IP dentro de uma janela, nome parecido, mesma sala e faixa de horário. **E-mail fica de fora:** pela RN-PLT-01 ele serve só para recuperação de senha.
- Alerta no painel (nunca bloqueio automático): "possível retorno de X (banido em ...)", com os vínculos, a confiança e o tempo.
- Um clique estende o ban à nova conta/dispositivo, com motivo e auditoria (`admin_actions`).
- Página de privacidade (`apps/web/src/screens/legal.tsx`) cita o histórico de dispositivos e o prazo.

## Critérios de aceite
- [ ] Conta nova no mesmo dispositivo ou IP de uma conta banida aparece como vínculo provável no painel, com o motivo.
- [ ] Um clique aplica o ban na nova conta e registra a auditoria.
- [ ] Duas contas legítimas na mesma rede (irmãos) geram alerta, não bloqueio.
- [ ] Teste de privacidade: o id cru do dispositivo nunca é guardado nem sai da API (só o hash truncado, D-33); IP só nas rotas admin, como nos bans.

## Notas técnicas
- Correlação na API (no join ou num job), não no game server; índices por `device_hash` e `ip` para não varrer a tabela; janela configurável.
- Convidados não têm conta: contam só pelo dispositivo/IP.
- **Decisão do PO antes do Pronto:** prazo de retenção das vistas (sugestão: 180 dias).

## Notas de implementação
—
