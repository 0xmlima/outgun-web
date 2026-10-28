# OG-483 — Emblema do clã: editor na página do clã

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S51 |
| Status | Em revisão |
| Dependências | OG-481, OG-482 |
| Regras de negócio | RN-EMB-01, RN-EMB-03, RN-UI-01 |
| Skills | `outgun-card-workflow` |

## História
Como líder ou admin de clã, quero montar o emblema com prévia nos tamanhos reais, vendo na hora o que já está ocupado.

## Contexto
- Pedido da comunidade (2026-10-28): identidade visual do clã a partir de uma prancha enviada por um membro. Proposta discutida num artifact (https://claude.ai/artifact/1gbxDv1TRgpon4t9N1yeyF, cópia em `plan/specs/emblema-do-cla/proposta.html`); respostas na D-85.
- PO: todos os cards do emblema (OG-480 a OG-489) entram na mesma sprint.
- P1: o montador da proposta foi aprovado como está ("tá incrível").

## Escopo
- Na gestão do clã (`apps/web/src/screens/clans.tsx`), um editor como o montador da proposta: moldura, símbolo, detalhes (filete, inverter), cores do clã; prévia grande e em 16, 32, 64 e 128 px, em fundo escuro e claro.
- Opções que dariam um emblema já usado aparecem desabilitadas com o motivo; molduras do hall só para quem as ganhou (OG-488).
- Design system v2; teclado, mouse e gamepad; no celular também (portal, D-80).

## Critérios de aceite
- [x] Líder e admin salvam; membro só vê. Combinação ocupada não é salva e a tela diz por quê.

## Notas de implementação
- `ui/Emblem.tsx` (componente único, usa `emblemSvg`) e `screens/clan-emblem.tsx` (editor), no painel de gestão do clã, que só líder e admins veem; o membro vê o emblema nas telas do OG-484.
- Opções ocupadas: compara `emblemKey` com `GET /clans/:tag/emblem/taken`; desabilitadas com o motivo no título, e o Salvar trava com a mensagem se a combinação atual for de outro clã.
- Cores vêm das cores salvas do clã (trocar cor e emblema juntos = salvar as cores primeiro). Prévia em 128 px e 16/32/64 px em fundo escuro e claro.
