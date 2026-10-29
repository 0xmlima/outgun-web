# OG-511 — "Copiar link" sem permissão de área de transferência estoura erro (OUTGUN-WEB-4)

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S54 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que o botão de copiar link funcione ou me diga que não deu, em vez de não fazer nada.

## Contexto
- Sentry OUTGUN-WEB-4 (release 2.49.2, app desktop, Chrome 152, rota `/replay`, 2 eventos em 2026-10-28 11:37 UTC): `NotAllowedError: Failed to execute 'writeText' on 'Clipboard': Write permission denied`, sem pilha (promessa rejeitada sem tratamento).
- `navigator.clipboard?.writeText(...)` sem `catch` em quatro lugares: `screens/ReplayScreen.tsx:80`, `screens/lobby.tsx:268`, `screens/MatchReport.tsx:429`, `screens/AdminScreen.tsx:1796`. Quando a permissão é negada (app desktop, iframe, navegador sem foco), o botão fica mudo e o erro vai ao Sentry.

## Escopo
- Um auxiliar único `copyText(texto): Promise<boolean>` em `apps/web/src/app/`: tenta `navigator.clipboard.writeText`, cai no `document.execCommand('copy')` com um `textarea` escondido, devolve se deu certo e nunca rejeita.
- Os quatro botões usam o auxiliar. Se não der, mostram "Não deu para copiar" e deixam o link visível e selecionado para copiar à mão.

## Critérios de aceite
- [ ] Com `writeText` rejeitando, o botão mostra o aviso e nenhuma promessa fica sem tratamento (teste do auxiliar).
- [ ] Sem novos eventos de OUTGUN-WEB-4 depois do deploy; resolvido no Sentry.

## Notas de implementação
(preenchido durante a execução)
