# OG-202 — Opções, controles e conta no novo visual

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S13 |
| Status | Concluído |
| Dependências | [OG-200](OG-200-design-system-v2.md) |
| Regras de negócio | RN-UI-01, RN-UI-02 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ajustar opções e minha conta em telas claras, agrupadas e fáceis de entender.

## Contexto
- `screens/options.tsx`, `ControlsScreen.tsx`, `account.tsx` (login, cadastro, senha, nome, clan tag, apagar conta).

## Escopo
- Opções em abas (Jogo, Gráficos, Áudio, Controles, Idioma) com os componentes do OG-200; deslizantes para volumes e alternadores para liga/desliga.
- Aba Áudio pronta para a trilha sonora (OG-222).
- Controles com remapeamento visual (tecla atual, "pressione uma tecla", voltar ao padrão).
- Login, cadastro, recuperação e gestão da conta como formulários web normais (autocomplete, erro junto do campo).

## Critérios de aceite
- [x] Todas as opções existentes continuam disponíveis e salvas/sincronizadas como antes (`options.test.ts` adaptado).
- [x] Gerenciadores de senha preenchem login e cadastro.
- [x] Prints de cada aba e do fluxo de conta.

## Notas técnicas
- Sem mudança nas regras das opções; só apresentação.

## Notas de implementação
- **Página** (`ui/Page.tsx`, novo): `Page` (título, botão voltar e Esc), `Form` (`<form>` de verdade com botão `submit`: Enter envia, gerenciadores de senha reconhecem) e `FormMessageLine` (mensagem geral).
- **Opções** (`screens/options.tsx`): uma página com abas Jogo (jogador, jogo, mensagens rápidas), Gráficos (tema e gráficos), Áudio, Controles e Idioma. Liga/desliga viraram alternadores; volume, previsão de atraso, banda, salas na tela e transparência das estatísticas viraram deslizantes (mesmos limites e passos de antes); listas viraram `ChoiceField`. Cores favoritas: faixa de cores com ←/→ e Ctrl+←/→ (+/−) para levar a cor, como antes. As URLs antigas (`/options/player`, `/theme`, `/quick-messages`, `/controls`...) abrem a aba que contém o submenu (`optionsTab`, testado em `options.test.ts`). Nenhuma regra mudou; as prefs continuam no mesmo formato e sincronizadas pelo `PrefsSync`.
- **Áudio:** painel "Efeitos sonoros"; o OG-222 acrescenta o painel da trilha sonora na mesma aba.
- **Controles** (`ControlsPanel` em `ControlsScreen.tsx`, agora aba): cada ação com as teclas atuais em `kbd`, "Adicionar tecla" (mostra "Pressione uma tecla..." e captura como antes, Esc cancela), "Padrão" e Delete para voltar ao esquema, "Restaurar padrão" no cabeçalho. A rota `/options/controls` continua valendo.
- **Conta** (`screens/account.tsx`): login, cadastro, recuperação, redefinição, troca de senha/nome/clan tag e exclusão como formulários com `autocomplete` (`username`, `current-password`, `new-password`, `email`); a troca de senha leva um campo de usuário oculto para o gerenciador saber a conta. O erro da API aparece junto do campo (`errorField`: nome, e-mail, convite, senha, clan tag); os outros no pé. Termos e privacidade abrem em outra aba para não perder o cadastro. A tela Conta é um `MenuList` com nome, clan tag e e-mail no subtítulo.
- **E2E:** cadastro e beta fechado usam o `switch` dos termos e o botão "Criar conta"; o erro do convite é conferido junto do campo.
- Prints (API simulada): `tools/parity/out/prints/og-202-opcoes-{game,graphics,sounds,controls,language}-{desktop,celular}.png`, `og-202-{login,cadastro-erro,conta,senha}-{desktop,celular}.png`. Conferido no Chrome: captura de tecla funciona (W adicionada a "Cima") e nada rola na horizontal a 360 px.
