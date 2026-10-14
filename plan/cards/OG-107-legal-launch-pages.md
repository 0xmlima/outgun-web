# OG-107 — Termos de uso, política de privacidade e página de lançamento

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S12 |
| Status | Pronto |
| Dependências | [OG-104](OG-104-security.md) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero saber quais dados o jogo guarda e as regras de uso, e como visitante, quero entender o que é o Outgun Web antes de jogar.

## Contexto e referências no original
- LGPD (seção 7 do PLAN); D-33 (id de dispositivo); D-32 (erros); dados guardados: conta, e-mail, IP em sessões/bans/auditoria/denúncias, estatísticas, feedback do beta.
- Créditos e licença: `CREDITS.md`, GPL-2.0-or-later, link do código-fonte.

## Escopo
- Páginas `/terms` e `/privacy` (pt-BR e inglês), linkadas no rodapé, no cadastro (aceite registrado) e no feedback do beta.
- Política de privacidade derivada do que o código guarda de fato (tabela de dados, finalidade, retenção, direitos LGPD: exportar e excluir a conta, que já existem).
- Página de lançamento (`/about` ou a home para quem chega): o que é, créditos aos autores originais e às comunidades, link do código-fonte, como jogar.
- Os textos legais são rascunho para revisão do PO (não substituem orientação jurídica).

## Critérios de aceite
- [ ] Cada dado pessoal guardado pelo código aparece na política (conferido contra o schema).
- [ ] Cadastro registra a versão dos termos aceitos.
- [ ] Páginas navegáveis por teclado e com as fontes do jogo.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
