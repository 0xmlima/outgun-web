# OG-107 — Termos de uso, política de privacidade e página de lançamento

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S12 |
| Status | Em revisão |
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
- [x] Cada dado pessoal guardado pelo código aparece na política (conferido contra o schema).
- [x] Cadastro registra a versão dos termos aceitos.
- [x] Páginas navegáveis por teclado e com as fontes do jogo.

## Notas técnicas
- —

## Notas de implementação
- `packages/content/src/privacy.ts`: versões dos termos e da política, inventário de dados (o quê, onde, por quê, por quanto tempo; pt-BR e inglês), seções da política e dos termos (conduta, conta, créditos, LGPD, o que não fazemos, terceiros opcionais). `TABLES` classifica toda tabela do banco; `apps/api/src/privacy.test.ts` falha se uma tabela nova não for classificada, se uma tabela com dado pessoal não estiver no inventário ou se uma coluna típica de dado pessoal (ip, e-mail, user agent, ids de usuário...) aparecer em tabela marcada como "não pessoal".
- Páginas `/terms`, `/privacy` (tabela do inventário) e `/about` (o que é, como jogar, créditos do original, software livre), em `TextPage` (teclado e fontes do jogo; textos em Latin-1, como exige o teste do i18n); links no rodapé de todas as telas de menu.
- Cadastro: item "Aceito os termos de uso e a política de privacidade" (obrigatório na tela) + atalhos para ler; a API grava `terms_version` e `terms_accepted_at` (migration `0013_terms_acceptance`).
- Correções para a política ser verdadeira: a exclusão de conta agora também tira o nome do feedback do beta (vira "(anon)"); a exportação LGPD inclui o feedback e as denúncias feitas.
- `VITE_OPERATOR_CONTACT` (build) mostra o contato de quem opera; sem ele aparece "a definir pelo responsável" — **pendência do PO/comunidade antes da publicação aberta**, junto da revisão dos textos.
- E2E: aceite no cadastro, páginas pelo rodapé (prints `og101/8-privacidade.png`, `9-sobre.png`).
