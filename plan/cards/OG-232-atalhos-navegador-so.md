# OG-232 — Atalhos do navegador e do sistema interrompendo a partida

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Correção |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S21 |
| Status | Backlog |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador no navegador (Mac, Windows, Linux), quero usar Ctrl, Shift, Alt/Option e Cmd nas minhas teclas sem que o navegador ou o sistema roube o atalho, para não ser interrompido no meio da partida.

## Contexto
- Achado do PO no beta (2026-10-15): atalhos com Ctrl/Shift/Cmd/Alt interrompem o jogo; ex.: mensagem automática associada a "Alt+1" troca de aba no Chrome do Mac.
- O que já existe (`apps/web/src/game/input/input.ts`): `preventDefault` nas teclas associadas e em Ctrl/Alt+setas; e o **modo foco** (F10: tela cheia + Keyboard Lock + pointer lock), que no Chrome/Edge captura até Ctrl+W/T/N e Cmd+1..9. Pouca gente sabe que ele existe.
- Limites do navegador (não dá para resolver só com código):
  - fora da tela cheia, atalhos reservados do navegador (Cmd/Ctrl+1..9, W, T, N, Tab) não podem ser bloqueados;
  - Keyboard Lock só existe no Chromium (Chrome, Edge, Opera); Firefox e Safari não têm;
  - atalhos do sistema nunca chegam à página: Cmd+Tab, Cmd+Q, Cmd+Espaço, Mission Control, Alt+Tab, tecla Windows, Ctrl+Alt+Del, teclas de aderência (Shift 5×).
- As associações (`bindings.ts`) aceitam Ctrl/Alt/Shift mas não Cmd (`metaKey`); no Mac, Option+número gera outro caractere — conferir se o acorde casa por `code` (casa) e o que o PO de fato pressionou (provável Cmd+1 num teclado de PC ou remapeado).

## Escopo
- Diagnóstico: registrar, num build de teste, o `keydown` que o PO aperta no Mac (tecla, `code`, modificadores) e confirmar a causa do Alt+1.
- Modo foco mais visível: dica na entrada da partida (uma vez por navegador) e na tela de controles, explicando que ele segura os atalhos do navegador no Chrome/Edge.
- Tela de controles: aviso ao associar um acorde que o navegador/sistema reserva (por plataforma), sugerindo outro ou o modo foco.
- Durante a partida, pedir confirmação ao sair da página (`beforeunload`) para Ctrl/Cmd+W ou Q acidental não derrubar o jogador sem aviso.
- Fora do escopo: suporte a Cmd nas associações (novo card se o PO quiser).

## Critérios de aceite
- [ ] Causa do "Alt+1 troca de aba no Mac" identificada e anotada; corrigida se estiver ao alcance da página.
- [ ] Com o modo foco no Chrome (Mac e Windows), Cmd/Ctrl+1..9, W, T e N não saem do jogo.
- [ ] Dica do modo foco e aviso de acorde reservado em pt-BR e inglês, dentro do design system v2.
- [ ] Fechar a aba durante a partida pede confirmação; fora da partida, não.

## Notas de implementação
(preenchido durante a execução)
