# OG-382 — Presets do painel em formulário: regras por categoria, com caixas e campos

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S40 |
| Status | Pronto |
| Dependências | OG-365 |
| Regras de negócio | D-69 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero montar um preset Casual marcando opções num formulário, sem decorar nomes de linhas de gamemod, para criar modos novos sem erro de digitação.

## Contexto
- Pedido do PO em 2026-10-22: a aba Presets tem muito espaço sobrando e só oferece uma caixa de texto livre ("Regras (linhas de gamemod)"); o moderador precisa saber de cor os nomes e faixas das settings.
- O registro `packages/settings/src/registry.ts` já tem tudo que um formulário precisa: nome, categoria (geral, bots, mapas, jogo, vida, power-ups, física), tipo (bool, inteiro, real, porcentagem...) e faixa. As `ignore` e as que não fazem sentido num preset (porta, IP, nome do servidor, senha) ficam fora.

## Escopo
- Tela nova da aba Presets: lista dos presets à esquerda (do jogo, só leitura, e do painel, editáveis; "Novo" e "Duplicar" a partir de um do jogo); à direita o editor com nome, descrição e as regras agrupadas por categoria em seções recolhíveis.
- Cada regra: caixa de marcar "alterar" + controle pelo tipo (caixa para bool, número com mín./máx. para inteiro/real/porcentagem); o valor padrão aparece ao lado. Só as marcadas viram linhas do preset.
- Rótulos e dicas em pt-BR (i18n), com o nome da linha de gamemod em fonte menor para quem conhece.
- "Modo texto" continua disponível (colar linhas), sincronizado com o formulário; linha desconhecida mostra o erro de `applyGamemod`.
- Pré-visualização do resultado (linhas geradas) antes de salvar.

## Critérios de aceite
- [ ] Criar um preset só por caixas e campos e abrir uma sala Casual com ele aplica as regras.
- [ ] Editar um preset salvo carrega as regras marcadas com os valores certos.
- [ ] Valor fora da faixa é barrado no formulário com a faixa à vista.
- [ ] Teste do mapeamento formulário ⇄ linhas de gamemod (ida e volta).

## Notas de implementação
(preenchido durante a execução)
