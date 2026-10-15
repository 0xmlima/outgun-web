# OG-272 — Telas de clã no cliente: criar, página do clã, gerir e buscar

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S16 |
| Status | Concluído |
| Dependências | [OG-270](OG-270-clas-cadastro-api.md), [OG-271](OG-271-clas-convites-pedidos.md) |
| Regras de negócio | RN-CLA-01 a RN-CLA-05, RN-SOC-01, RN-UI-01 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver, criar e administrar clãs no jogo, para participar da comunidade de clãs.

## Escopo
- Página do clã `/clans/:tag`: nome, tag, descrição, data de formação, membros (papel, desde quando, link para o perfil) e estatísticas (OG-273, quando houver).
- Diretório `/clans` com busca por nome ou tag (como RN-SOC-04).
- "Meu clã": criar, editar, convidar, aprovar pedidos, expulsar, promover, transferir liderança, sair, dissolver (com confirmação).
- Perfil do jogador (OG-212) mostra o clã com link; a tela antiga de "clan tag" nas Opções da conta sai.
- Design system v2; páginas web com rolagem e URL estável (RN-SOC-01).

## Critérios de aceite
- [x] Fluxos completos por teclado, mouse, toque e gamepad, de 360 px a telas grandes.
- [x] Ações de gestão só aparecem para quem tem o papel (e a API recusa de qualquer forma).

## Notas de implementação
- Rotas `/clans` (diretório com busca), `/clans/new`, `/clans/:tag` (página + gestão conforme o papel) e `/clans/inbox` (OG-271). Ações destrutivas (sair, expulsar, transferir, dissolver) pedem confirmação na própria linha.
- Menu inicial ganhou "Clãs" (contador de convites/pedidos); Conta → "Clã"; `/account/clan-tag` redireciona para `/clans`; perfil e diretório de jogadores levam à página do clã.
- Só componentes do design system (Page/Panel/Table/Form/Button); navegação por teclado/gamepad é a dos componentes. Conferência manual em 360 px e com gamepad fica para o fechamento.
- Estatísticas do clã (OG-273) ainda não aparecem.
