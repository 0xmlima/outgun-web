# OG-323 — Outgun instalável pelo navegador (PWA)

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S32 |
| Status | Em andamento |
| Dependências | — |
| Regras de negócio | D-58 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero instalar o Outgun pelo Chrome ou Edge, para abrir o jogo pelo ícone na área de trabalho, numa janela própria.

## Contexto
- D-58: a versão para computador é sempre o próprio site; nada de cliente empacotado.
- Chrome e Edge oferecem "Instalar" quando o site tem um manifesto web com nome, ícones e `display: standalone`; não é preciso service worker (e um cache offline traria o risco de cliente desatualizado).

## Escopo
- `manifest.webmanifest` (nome, cores do tema, `display: standalone`, `start_url: /`) e ícones PNG 192/512 (com versão `maskable`) a partir do ícone do site.
- Link do manifesto e `theme-color` no `index.html`; CSP permite o manifesto.
- Botão "Instalar no computador" na página de download (OG-325), usando `beforeinstallprompt` quando o navegador oferecer.

## Critérios de aceite
- [ ] O Chrome mostra "Instalar Outgun" na barra de endereço; o app abre em janela própria com ícone e nome do Outgun.
- [ ] Sem service worker: o app instalado sempre carrega a versão atual do site.

## Notas de implementação
