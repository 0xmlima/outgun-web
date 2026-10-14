# OG-104 — Segurança e anti-cheat

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S11 |
| Status | Pronto |
| Dependências | [OG-043](OG-043-client-input.md), [OG-081](OG-081-auth.md) |
| Regras de negócio | RN-PLT-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero partidas justas e meus dados protegidos.

## Contexto e referências no original
- Original: servidor autoritativo, validações em `processMessage`, bans em `auth.cpp`.

## Escopo
- Revisão OWASP ASVS L1 da API; headers de segurança; CSP.
- Anti-cheat: validação de input, detecção de taxa anômala, AOI garantida, relatórios de jogador.
- Bans por conta e dispositivo/IP.

## Critérios de aceite
- [ ] Relatório de revisão sem achados altos abertos.
- [ ] Teste: cliente modificado não obtém posição de inimigos fora da AOI.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
