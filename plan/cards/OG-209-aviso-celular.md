# OG-209 — Aviso de que o jogo não está disponível para celular

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 1 pt |
| Sprint | S18 |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | RN-UI-01 (revista por D-50) |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero que o celular mostre só um aviso de "não disponível", para o time parar de gastar esforço com mobile e focar no desktop.

## Contexto
- Pedido do PO em 2026-10-15 (D-50): validar telas e o jogo em celular estava travando features de desktop.

## Escopo
- Em celular (toque sem mouse e lado menor da tela abaixo de 600 px), o cliente inteiro mostra só o aviso, em pt-BR e nos outros idiomas pela chave em inglês.
- Desktop, notebooks com toque e tablets com teclado continuam normais.
- RN-UI-01 deixa de exigir 360 px; `pnpm visual:check` deixa de capturar 360 px.

## Critérios de aceite
- [x] Celular vê só o aviso; desktop não muda.

## Notas de implementação
- `isPhone()` e `PhoneNotice` em `app/Shell.tsx` (no `Root`, antes de qualquer rota). Sem opção de "abrir mesmo assim".
