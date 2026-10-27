# OG-444 — Botão "Sair do Outgun" no app desktop

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S47 |
| Status | Em revisão |
| Dependências | — |
| Issue | [#9](https://github.com/thiagovasconcellos/outgun-web/issues/9) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador do app da Steam, quero um botão para sair do jogo, para não depender de Alt+F4.

## Contexto
- Issue #9 (área: Partida / HUD; gravidade: Baixo; frequência: Sempre).
- Versão: 2.46.3 · Dispositivo: computador · Navegador e sistema: app desktop/Steam no Windows · Data e hora: Tue Oct 27 2026 00:51:06 GMT+0000 (Europe/Lisbon) · Apelido no jogo: ozzylords
- Passos: 1. Quero sair do jogo mas nao consigo - estou pelo app steam e nao tem um botao pra sair
- Esperado: Ter um botao pra sair
- Obtido: Nao tem botao pra sair
- Evidências: Última partida: https://outgunweb.com.br/matches/cab11bd7-ffe4-4da8-9bc1-b7f623470a58
- Contorno: —

## Escopo
- No Windows o app abre em tela cheia, sem a barra da janela (`apps/desktop/main.js`). "Sair do Outgun" na barra de cima, só no app desktop.

## Critérios de aceite
- [x] O botão aparece só no app desktop e fecha o app.
- [ ] PO confere no app da Steam (Windows).

## Notas de implementação
- Ponte nova `quit` (`preload.cjs` → `outgun:quit` → `app.quit()`, só da origem do jogo). Clientes já instalados não têm a ponte: o site usa `window.close()`, que no Electron fecha a janela e, com ela, o app.
- A ponte nova só chega com um build novo do app (`pnpm steam:upload`); o fallback cobre até lá. Texto reaproveitado: "Exit Outgun" / "Sair do Outgun".
