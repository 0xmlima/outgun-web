# OG-515 — E-mail de boas-vindas atualizado para a v2, com versão HTML

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Melhoria |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | — |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero que o e-mail de boas-vindas apresente o Outgun Web de hoje, e não a proposta de fidelidade da v1, com um visual à altura do site.

## Contexto
- Pedido do PO em 2026-10-29. O texto ainda falava em "Outgun 1.0.3 com as mesmas regras, física e mapas" e pedia retorno sobre a fidelidade ao original.

## Escopo
- Texto novo em pt-BR e inglês: navegador, app e Steam; controles; Casual, Ranqueado e Treino; clã, número e perfil; celular só portal; "Enviar feedback".
- HTML com tabelas e estilos inline nas cores do design system, com um botão "Jogar agora"; a versão em texto puro acompanha.
- Reenviar a todas as contas do beta.

## Critérios de aceite
- [x] Texto novo nas duas línguas (texto puro e HTML).
- [x] Teste do cadastro segue passando.
- [x] Reenviado a todas as contas do beta.

## Notas de implementação
- `apps/api/src/mail/templates.ts`: cores copiadas de `apps/web/src/ui/tokens.css`, fundo escuro.
