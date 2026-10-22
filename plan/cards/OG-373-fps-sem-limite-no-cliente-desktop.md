# OG-373 — FPS sem limite de verdade no cliente desktop (Steam)

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S39 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | D-73 |
| Skills | `outgun-card-workflow` |

## História
Como jogador competitivo na Steam, quero que "sem limite" signifique sem limite, para ter o máximo de quadros e a menor latência de tela que meu computador aguenta.

## Contexto
- A opção "Limite de FPS = sem limite" só zera o `maxFPS` do PixiJS (`host.ts:529`), mas o quadro vem do `requestAnimationFrame`, que o Chromium prende ao VSync: num monitor de 60 Hz (ou com vários monitores, preso ao principal no Windows), fica em 60. O cliente Electron (`apps/desktop/main.js`) não muda isso.
- No navegador não há como passar da taxa do monitor; no Electron há (`disable-frame-rate-limit`, `disable-gpu-vsync`), mas os switches só valem na inicialização.

## Escopo
- Desktop: preload mínimo (`contextBridge`, sem Node na página) com `outgunDesktop.setFrameRate('vsync' | 'unlocked')`; o main grava em `userData` e aplica os switches na próxima abertura ("vale ao reiniciar o jogo").
- Opções > Gráficos: no desktop, "Sincronia vertical (VSync)" ligada/desligada além do limite; no navegador, "sem limite" vira "taxa do monitor" com dica explicando o porquê.
- `app.init` do PixiJS com `powerPreference: 'high-performance'` (notebooks com duas placas).
- Padrão **sem VSync** (decisão do PO na S39): menos atraso na tela; o limite "automático" vira 240 FPS para a placa não desenhar sem parar, e "sem limite" fica como escolha explícita. Quem vir a imagem rasgar religa o VSync.
- D-73 na seção 12; README do desktop atualizado.

## Critérios de aceite
- [ ] No cliente desktop com VSync desligado, o contador de FPS passa de 60 num monitor de 60 Hz (conferir no fechamento com o cliente local: `OUTGUN_URL=... npm start`).
- [x] Limites (60, 144, 240...) continuam valendo com VSync desligado (o `maxFPS` do PixiJS segue igual).
- [x] A página sem o cliente (navegador) não quebra sem `outgunDesktop` (`desktopBridge()` opcional; clientes antigos sem o preload também).
- [ ] Novo build na branch beta da Steam (`pnpm steam:upload`) para a comunidade testar — no fechamento, com a ordem do PO.

## Notas técnicas
- O jogo é desenhado no máximo a cada quadro; o mundo anda a 10 Hz com extrapolação, então mais FPS reduz a latência de tela e deixa o movimento mais liso, não muda a física.

## Notas de implementação
- `apps/desktop/preload.cjs` (CommonJS: preload com sandbox não aceita ESM) + IPC síncrono no `main.js`; o envio só é aceito da origem do jogo. Modo gravado em `userData/outgun-desktop.json`, aplicado ao abrir.
- Web: "Sincronia vertical (VSync)" em Gráficos só no cliente; "sem limite" vira "taxa do monitor" (com dica) quando o FPS não pode passar do monitor. `powerPreference: 'high-performance'` no PixiJS.
- Padrão trocado para VSync desligado + automático 240 a pedido do PO (calor e rasgo a confirmar com os testadores do beta da Steam).
- Cliente desktop antigo (sem preload) continua funcionando; precisa de instalador/build da Steam novos para ganhar a opção.
