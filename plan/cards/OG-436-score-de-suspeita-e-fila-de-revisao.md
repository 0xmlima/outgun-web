# OG-436 — Score de suspeita de automação e fila de revisão

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-435 |
| Regras de negócio | RN-STA-01, RN-PLT-05 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero uma lista curta de partidas e jogadores suspeitos com o motivo de cada um, para revisar primeiro o que importa.

## Contexto
- A fila de denúncias atual (`GET /admin/reports`) ordena por data, então uma denúncia de "mira automática" concorre com reclamação de chat e chega sem prova.
- A telemetria do OG-435 dá os sinais que separam automação de habilidade; falta transformá-los em prioridade e em motivo legível.

## Escopo
- Heurísticas sobre a telemetria, cada uma com peso configurável:
  - jitter de `input`/`fire` abaixo de X por N partidas seguidas;
  - latência "virou a arma → atirou" ~0 em mais de Y% dos tiros;
  - reação ao inimigo abaixo de 3 frames de forma consistente;
  - precisão acima do percentil 99,9 em muitas partidas;
  - sessões longas com cadência idêntica entre partidas e entre mapas.
- Score 0–100 por jogador/partida, com os motivos escritos por extenso ("reagiu em 1 frame em 92% dos tiros"), limiar e pesos ajustáveis no painel (tabela, sem deploy).
- Fila de revisão na aba de moderação, ordenada por score, com filtro por período, por jogador e por motivo; estados novo / em análise / descartado / aplicado.
- **Sem punição automática:** o score só ordena a fila; quem decide é o moderador (OG-438).
- Teste com fixtures: telemetria do cliente automático (a mesma do `anticheat.test.ts`) acima do limiar; um jogador humano sintético (jitter e reação plausíveis) abaixo.

## Critérios de aceite
- [ ] Cliente automático de teste fica acima do limiar; jogador humano sintético fica abaixo, em teste.
- [ ] Moderador vê a fila com score e motivos e muda o estado; toda mudança vai para `admin_actions`.
- [ ] Pesos e limiar mudam sem deploy e valem a partir da próxima partida.
- [ ] Nenhum ban ou restrição é aplicado só pelo score.

## Notas técnicas
- Calcular no fechamento da partida, na API (job a partir do relatório), e não no game server.
- Endpoint novo `GET /admin/suspicion` ao lado de `/admin/reports`; a tela reaproveita a aba de denúncias (`AdminScreen.tsx`) sem mudar o visual do design system.
- Cuidado com falso positivo de jogador muito bom e de rede instável (jitter de entrada por lag): o score precisa dos dois lados (jitter **baixo** e reação **rápida**) para subir.

## Notas de implementação
—
