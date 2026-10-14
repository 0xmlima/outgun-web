# OG-105 — Beta fechado, balanceamento e lançamento

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S12 |
| Status | Bloqueado |
| Dependências | [OG-109](OG-109-single-host-deploy.md), [OG-106](OG-106-closed-beta.md), [OG-107](OG-107-legal-launch-pages.md), [OG-108](OG-108-network-telemetry.md) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

> Bloqueado por: OG-106 a OG-109 e decisão do PO — conta e VPS do beta (DigitalOcean cogitada), domínio (opcional; sem ele, `<ip>.sslip.io`) e lista de convidados.

## História
Como PO, quero validar o jogo com jogadores reais (incluindo veteranos) antes do lançamento público.

## Contexto e referências no original
- Comunidade brasileira do Outgun (outgun.sf.net) e finlandesa (outgun.mbnet.fi).

## Escopo
Quebrado na S12 (2026-10-14): a parte construível virou OG-109 (deploy em VPS), OG-106 (convites,
feedback, triagem), OG-107 (termos, privacidade, lançamento) e OG-108 (telemetria de rede). Fica aqui
a execução, conduzida pelo PO com apoio do agente:
- Subir o beta na VPS do PO (com autorização dele) e convidar os jogadores selecionados.
- Acompanhar feedback e telemetria; corrigir bugs críticos; ajustar rede/predição com os dados.
- Decidir com a comunidade onde publicar de verdade (provavelmente um provedor brasileiro) e o go-live.

## Critérios de aceite
- [ ] ≥ 20 veteranos avaliam a sensação de jogo como fiel (nota ≥ 4/5).
- [ ] Nenhum bug crítico aberto.
- [ ] Lançamento público realizado.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
