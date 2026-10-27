# OG-436 — Score de suspeita de automação e fila de revisão

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-435, OG-389 |
| Regras de negócio | RN-STA-01, RN-PLT-05 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero uma lista curta de partidas e jogadores suspeitos com o motivo de cada um, para revisar primeiro o que importa.

## Contexto
- A fila de denúncias atual (`GET /admin/reports`) ordena por data, então uma denúncia de "mira automática" concorre com reclamação de chat e chega sem prova.
- A telemetria do OG-435 dá os sinais que separam automação de habilidade; falta transformá-los em prioridade e em motivo legível.

## Escopo
- Heurísticas sobre a telemetria, cada uma com peso e limiar configuráveis (valores de exemplo, ajustados no refinamento):
  - fase das mudanças de tecla e de `fire` presa à grade de 100 ms (desvio abaixo de X ms) por N partidas seguidas;
  - mudança de direção e `fire` no mesmo pacote/ms em mais de Y% dos tiros;
  - reação ao inimigo visível abaixo de ~120 ms de forma consistente (só tiros iniciados, ver OG-435);
  - precisão muito acima da população — por percentil só quando houver jogadores suficientes; antes disso, limiar absoluto;
  - sessões longas com cadência idêntica entre partidas e entre mapas.
- Score 0–100 por jogador/partida, com os motivos escritos por extenso ("reagiu em menos de 100 ms em 92% dos tiros"); pesos e limiar numa tabela editável no painel, sem deploy.
- Fila de revisão na moderação, ordenada por score, com filtro por período, por jogador e por motivo; estados novo / em análise / descartado / aplicado.
- **Sem punição automática:** o score só ordena a fila; quem decide é o moderador (OG-438).
- Testes com as fixtures do OG-435: cliente automático acima do limiar; humano sintético abaixo; humano sintético com ping alto e jitter de rede também abaixo.

## Critérios de aceite
- [ ] Cliente automático de teste fica acima do limiar; humano sintético (com e sem lag) fica abaixo, em teste.
- [ ] Moderador vê a fila com score e motivos e muda o estado; toda mudança vai para `admin_actions`.
- [ ] Pesos e limiar mudam sem deploy e valem a partir da próxima partida.
- [ ] Nenhum ban ou restrição é aplicado só pelo score.

## Notas técnicas
- Calcular no fechamento da partida, na API (a partir do relatório), e não no game server.
- Endpoint novo `GET /admin/suspicion` ao lado de `/admin/reports`; a tela reaproveita a aba de denúncias (`AdminScreen.tsx`, visual v2 do OG-389) sem estilo fora dos tokens (RN-UI-01).
- Falso positivo de jogador muito bom e de rede instável: o score só sobe com sinais de **regularidade** (fase presa, mesmo pacote) **e** de **velocidade** (reação) juntos; precisão sozinha nunca passa do limiar.

## Notas de implementação
—
