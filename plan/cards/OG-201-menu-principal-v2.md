# OG-201 — Novo menu principal e moldura das telas

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S13 |
| Status | Em andamento |
| Dependências | [OG-200](OG-200-design-system-v2.md) |
| Regras de negócio | RN-UI-01, RN-UI-04 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero um menu principal moderno, em que "Jogar" esteja a um clique, para entrar numa partida rápido e achar o resto sem procurar.

## Contexto
- `screens/menus.tsx` (`HomeScreen`) e `app/Shell.tsx`: lista numerada no estilo do `src/menu.cpp` original.

## Escopo
- Nova moldura (`Shell`): barra superior com logo, navegação (Jogar, Salas, Ranking, Replays) e chip da conta (entrar / nome + clã); rodapé discreto com Sobre, Termos, Privacidade e código-fonte (GPL, OG-005).
- Tela inicial: chamada principal "Jogar agora" (Casual), atalhos para salas, sala privada e últimas partidas do jogador; Opções, Ajuda, Créditos, Feedback e Moderação conforme o papel.
- Fundo com identidade do jogo (ex.: mapa desfocado ou arte do tema) sem prejudicar a leitura.
- Navegação completa por teclado e gamepad, como hoje; mouse e toque como primeira classe.
- Ponto de início da trilha do menu (OG-221).

## Critérios de aceite
- [ ] Todas as ações do menu atual continuam acessíveis (E2E percorre cada uma).
- [ ] "Jogar agora" funciona com e sem conta (beta fechado leva ao login, como hoje).
- [ ] Funciona em 360 px de largura sem rolagem horizontal.
- [ ] Prints desktop e celular, com e sem conta.

## Notas técnicas
- Rotas não mudam: links já compartilhados continuam válidos.

## Notas de implementação
(preenchido durante a execução)
