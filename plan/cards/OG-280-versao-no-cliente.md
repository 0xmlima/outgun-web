# OG-280 — Mostrar a versão do jogo no cliente

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Could |
| Estimativa | 1 pt |
| Sprint | S22 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver em que versão do Outgun estou, para saber se estou atualizado e citar a versão ao relatar um problema.

## Contexto
- Desde a S19 a versão do jogo é a do `package.json` da raiz, igual em todos os pacotes (`tools/dev/version.mjs`; cada sprint aprovada sobe o número do meio: S19 = 2.19.0). A API já devolve a versão em `/health`.

## Escopo
- Exibir a versão do cliente (lida do `package.json` no build) em algum lugar discreto: créditos e/ou rodapé do menu principal (a definir com o PO).
- Opcional: avisar quando a versão do cliente for diferente da API (página antiga em cache).

## Critérios de aceite
- [x] A versão aparece no lugar escolhido pelo PO e muda sozinha quando `version.mjs` sobe o número.

## Notas de implementação
- Lugar escolhido pelo PO: só no menu principal (abaixo do subtítulo), "Versão 2.21.0".
- `__APP_VERSION__` vem do `apps/web/package.json` no build (`vite.config.ts`, `app/version.ts`). O opcional entrou: o menu relê `/health` a cada 5 min e ao voltar para a aba; se a API estiver numa versão mais nova, aparece "Nova versão disponível: recarregar".
