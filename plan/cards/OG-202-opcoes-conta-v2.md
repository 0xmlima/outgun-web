# OG-202 — Opções, controles e conta no novo visual

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S13 |
| Status | Pronto |
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
- [ ] Todas as opções existentes continuam disponíveis e salvas/sincronizadas como antes (`options.test.ts` adaptado).
- [ ] Gerenciadores de senha preenchem login e cadastro.
- [ ] Prints de cada aba e do fluxo de conta.

## Notas técnicas
- Sem mudança nas regras das opções; só apresentação.

## Notas de implementação
(preenchido durante a execução)
