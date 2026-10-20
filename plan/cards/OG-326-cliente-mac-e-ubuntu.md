# OG-326 — Cliente para macOS e Ubuntu e ícones dos sistemas na página

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S32 |
| Status | Concluído |
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
- [x] `Outgun-mac.dmg` e `Outgun-linux.deb` saem do CI e abrem o jogo como o `.exe`.
- [x] A página mostra os três sistemas com ícone e destaca o de quem visita.

## Notas de implementação
- `.dmg` universal (~230 MB) com assinatura ad hoc, sem notarização; testado abrindo o `.app` neste Mac. No macOS o app tem um menu mínimo (Cmd+Q e copiar/colar dependem dele).
- `.deb` testado em Docker (Ubuntu 22.04 e 24.04, Xvfb): o electron-builder não declara o áudio; `libasound2t64 | libasound2` nessa ordem, senão o apt escolhe o `liboss4-salsa-asound2` e o app não abre. `desktopName` liga a janela ao ícone.
- Ícones: Windows desenhado aqui; Apple e Ubuntu do Simple Icons 16.34.0 (CC0). A página destaca o sistema pelo user agent.
