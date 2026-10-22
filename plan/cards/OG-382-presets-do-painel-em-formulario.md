# OG-382 — Presets do painel em formulário: regras por categoria, com caixas e campos

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S40 |
| Status | Concluído |
| Dependências | OG-365 |
| Regras de negócio | D-69 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero montar um preset Casual marcando opções num formulário, sem decorar nomes de linhas de gamemod, para criar modos novos sem erro de digitação.

## Contexto
- Pedido do PO em 2026-10-22: a aba Presets tem muito espaço sobrando e só oferece uma caixa de texto livre ("Regras (linhas de gamemod)"); o moderador precisa saber de cor os nomes e faixas das settings.
- O registro `packages/settings/src/registry.ts` já tem tudo que um formulário precisa: nome, categoria (geral, bots, mapas, jogo, vida, power-ups, física), tipo (bool, inteiro, real, porcentagem...) e faixa. As `ignore` e as que não fazem sentido num preset (porta, IP, nome do servidor, senha) ficam fora.

- **Diretriz do PO (2026-10-22):** a tela de moderação tem de ser simples para qualquer moderador, não só para quem conhece o jogo a fundo: rótulos em português claro, sem exigir nomes de gamemod ou de arquivos, padrões à vista.

## Escopo
- Tela nova da aba Presets: lista dos presets à esquerda (do jogo, só leitura, e do painel, editáveis; "Novo" e "Duplicar" a partir de um do jogo); à direita o editor com nome, descrição e as regras agrupadas por categoria em seções recolhíveis.
- Cada regra: caixa de marcar "alterar" + controle pelo tipo (caixa para bool, número com mín./máx. para inteiro/real/porcentagem); o valor padrão aparece ao lado. Só as marcadas viram linhas do preset.
- Rótulos e dicas em pt-BR (i18n), com o nome da linha de gamemod em fonte menor para quem conhece.
- "Modo texto" continua disponível (colar linhas), sincronizado com o formulário; linha desconhecida mostra o erro de `applyGamemod`.
- Pré-visualização do resultado (linhas geradas) antes de salvar.

## Critérios de aceite
- [x] Criar um preset só por caixas e campos e abrir uma sala Casual com ele aplica as regras.
- [x] Editar um preset salvo carrega as regras marcadas com os valores certos.
- [x] Valor fora da faixa é barrado no formulário com a faixa à vista.
- [x] Teste do mapeamento formulário ⇄ linhas de gamemod (ida e volta).

## Notas de implementação
- `@outgun/settings/preset-form`: `PRESET_FIELDS` (categorias de preset + `max_players`, sem `ignore`/strings), rótulo em inglês com unidade (pt-BR em `i18n/setting-texts.ts`), `formFromLines`/`linesFromForm` e `fieldProblem` (o próprio `applySetting`, mesma mensagem do servidor). Teste de ida e volta com os presets Casual do jogo.
- Padrão mostrado = o do Clássico (base do preset); linhas que o formulário não representa ficam em `other` e aparecem no modo texto, com o erro de `casualPresetProblems` (rodado no cliente).
- Valores normalizados na ida e volta (`0.5` → `50%`, `1` → `normal` na colisão).
- Presets do jogo (inclusive o Ranked) abrem só leitura, com "Duplicar para editar".
- Ajuste visual pedido pelo PO (2026-10-22, tela "confusa e pouco harmoniosa"): lista em cartões com descrição em 2 linhas, editor num `Panel` com Nome/Descrição do design system, modo texto em interruptor, categorias em blocos com contador e regras em grade (nome · valor · padrão/faixa), regra desmarcada mostra só o valor padrão.
