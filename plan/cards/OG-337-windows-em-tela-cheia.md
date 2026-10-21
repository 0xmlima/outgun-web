# OG-337 — Cliente para Windows abre em tela cheia

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Melhoria |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S35 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | D-58 |
| Skills | `outgun-card-workflow` |

## História
Como jogador no Windows, quero que o Outgun abra em tela cheia, como o jogo antigo.

## Contexto
- Pedido do PO em 2026-10-21. O cliente Electron (OG-324) abria numa janela de 1280×800.

## Escopo
- `fullscreen` na criação da janela quando `process.platform === 'win32'`; F11 continua alternando (já existia). macOS e Ubuntu seguem em janela.

## Critérios de aceite
- [x] No Windows a janela nasce em tela cheia; F11 volta para a janela.
- [ ] Instalador novo publicado e PO confere (o cliente muda: precisa do workflow "Cliente desktop", `upload-desktop.sh` e `pnpm steam:upload`).

## Notas de implementação
- Mudança no `main.js`: diferente do resto da sprint, só chega aos jogadores com um instalador novo (D-58).
