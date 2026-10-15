# OG-285 — Opções não ficam salvas (cor favorita, mensagens rápidas)

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Correção |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S21 |
| Status | Backlog |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que o que eu mudo nas opções continue lá quando volto à tela, e saber que foi salvo, para não refazer a configuração.

## Contexto
- Achado do PO no beta (2026-10-15): não há botão "Salvar"; a cor favorita escolhida e as mensagens rápidas criadas voltam ao valor anterior/zeradas ao sair e voltar às Opções.
- As opções são salvas sozinhas a cada mudança (`setPrefs` → localStorage; com conta, `PrefsSync` grava na conta 1 s depois), mas nada na tela diz isso.
- **Cor favorita (causa achada):** `FavoriteColors` (`apps/web/src/screens/options.tsx:77`) só reordena com Ctrl+setas (herança do `Colorselect` do original); clicar numa cor ou usar as setas só move o destaque, que é estado local e volta ao primeiro ao reabrir a tela. Nada é gravado.
- **Mensagens rápidas (a confirmar):** o campo grava a cada tecla. Suspeitas:
  1. outra aba aberta do jogo com as opções antigas em memória: qualquer mudança nela grava na conta o conjunto inteiro, antigo (sem ouvir o evento `storage` entre abas);
  2. sair da tela antes de 1 s cancela o envio pendente para a conta (`clearTimeout` no efeito) e, ao entrar de novo (outra sessão/dispositivo), a conta devolve o valor velho;
  3. `PUT /account/settings` recusado em silêncio (`.catch(() => undefined)`).

## Escopo
- Cor favorita: clicar (ou Enter/espaço) numa cor a torna a primeira favorita; Ctrl+setas continua reordenando; a ordem salva aparece ao reabrir. Texto de ajuda curto sob o campo.
- Mensagens rápidas: achar a causa pelo código e corrigir; abas sincronizadas pelo evento `storage`; envio pendente para a conta não se perde ao sair da tela (grava no desmontar/`pagehide`).
- Indicador discreto "Salvo" / "Salvando..." / "Não foi possível salvar na conta" nas Opções (tokens do design system), em vez de botão Salvar (aprovado pelo PO em 2026-10-15).

## Critérios de aceite
- [ ] (PO) Escolher a cor favorita, sair e voltar às Opções (e recarregar a página): a escolha continua.
- [ ] (PO) Criar mensagens rápidas, sair e voltar (e recarregar; e entrar em outro navegador com a mesma conta): continuam.
- [ ] Testes de `FavoriteColors`/`moveColor` e do `PrefsSync` (envio no desmontar, aba antiga não sobrescreve).

## Notas de implementação
(preenchido durante a execução)
