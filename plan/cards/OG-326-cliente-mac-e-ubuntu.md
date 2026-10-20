# OG-326 — Cliente para macOS e Ubuntu e ícones dos sistemas na página

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S32 |
| Status | Em andamento |
| Dependências | OG-324, OG-325 |
| Regras de negócio | D-58 |
| Skills | `outgun-card-workflow` |

## História
Como jogador no Mac ou no Ubuntu, quero baixar o Outgun para o meu sistema e achar o download certo pelo ícone.

## Contexto
- Pedido do PO na revisão da S32 (2026-10-20): além do `.exe`, um `.app` para Mac e uma versão para Ubuntu, com os ícones de Windows, Mac e Ubuntu na página de download.
- Mesma casca do OG-324 (D-58): nada do jogo no instalador.

## Escopo
- `electron-builder`: `.dmg` universal (Apple Silicon e Intel) com o `Outgun.app`, sem assinatura da Apple (assinatura ad hoc); `.deb` para Ubuntu 22.04+ (x64).
- Workflow "Cliente desktop" com um job por sistema (Windows, macOS, Ubuntu).
- `upload-desktop.sh` aceita os três arquivos e mantém um link fixo por sistema.
- Página `/download`: um bloco por sistema com o ícone, destaque para o sistema de quem visita e as instruções de abrir sem assinatura (SmartScreen no Windows, "Abrir mesmo assim" no Mac).

## Critérios de aceite
- [ ] `Outgun-mac.dmg` e `Outgun-linux.deb` saem do CI e abrem o jogo como o `.exe`.
- [ ] A página mostra os três sistemas com ícone e destaca o de quem visita.

## Notas de implementação
