# OG-401 — Resolução do monitor no cliente para Windows

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S41 (2.41.1) |
| Status | Em revisão |
| Dependências | OG-337, OG-400 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador no Windows, quero escolher a resolução do monitor na tela cheia, como nos jogos antigos, para jogar esticado (4:3), com mais FPS ou com mais Hz.

## Contexto
- Pedido do PO em 2026-10-23: "foco total no Windows"; Mac e Ubuntu ficam como estão.
- O Chromium não troca o modo do monitor (a tela cheia é uma janela sem borda); o cliente chama o user32 (`EnumDisplaySettingsW`, `ChangeDisplaySettingsExW` com `CDS_FULLSCREEN`) pela koffi 3.3.2 (MIT, FFI sem compilar).

## Escopo
- Opções → Gráficos (só no cliente para Windows): "Resolução do monitor" com os modos de 32 bits do monitor principal (largura × altura · Hz) e "do sistema"; o botão "Aplicar resolução" troca na hora (escolher não aplica: cada troca apaga a tela).
- Vale só em tela cheia, no monitor principal e em foco; Alt+Tab, minimizar, sair da tela cheia (F11) ou fechar devolvem a resolução do sistema; voltar ao jogo aplica de novo.
- Opção de inicialização `--resolution=1920x1080@144` (vale por cima das Opções; `--resolution=system` desliga), na Steam e no atalho do `.exe`.
- Escolha gravada em `userData/outgun-desktop.json`. koffi fora dos pacotes de macOS e Linux.

## Critérios de aceite
- [ ] No Windows, escolher um modo e aplicar troca a resolução em tela cheia; Alt+Tab volta à do sistema e voltar ao jogo reaplica (PO confere).
- [ ] Fechar o jogo (ou ele travar) deixa o monitor na resolução do sistema (PO confere).
- [ ] `--resolution=1280x720@60` nas opções de inicialização da Steam abre nesse modo (PO confere).
- [x] Mac e Linux sem mudança (a opção não aparece; o app abre igual).

## Notas de implementação
- `apps/desktop/display-win.js`: DEVMODEW como Buffer de 220 bytes (só os campos usados). Sincronia com 300 ms de espera depois dos eventos da janela, porque a própria troca mexe em foco e tamanho; a janela em tela cheia acompanha o tamanho novo da tela (`display-metrics-changed`).
- Esticar (4:3 em 16:9) ou faixas pretas depende da escala do painel da placa de vídeo, não do jogo.
- Não testado no Windows aqui (sem máquina); se o modo não aplicar, o app segue na resolução do sistema.
