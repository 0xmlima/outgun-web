# OG-527 — OutCup: avisos por e-mail e no portal

| Campo | Valor |
|---|---|
| Épico | E15 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S56 |
| Status | Backlog |
| Dependências | OG-524 |
| Regras de negócio | RN-CUP-12, D-88 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero saber quando a inscrição abre, qual é minha dupla e quando é meu jogo, sem precisar ficar olhando o site.

## Contexto
- Proposta 2x2 + OutCup (2026-10-29): artifact https://claude.ai/artifact/CUCHmHonx7Ss4NfXqUv5xf, cópia em `plan/specs/copa-2x2/proposta.html`; respostas do PO com a comunidade na D-88.
- E-mail pelo Resend funcionando desde 2026-10-29 (`MAIL_FROM` do domínio).

## Escopo
- E-mails (pt-BR/en, HTML nas cores do site, como o OG-515): inscrição aberta (a quem jogou ranqueada no mês), dupla sorteada e adversário, horário proposto, jogo marcado, sala aberta, prazo acabando (24 h antes) e resultado.
- Aviso no portal (sino/tela inicial) com os mesmos eventos.
- Opção de não receber e-mails da OutCup nas configurações da conta.

## Critérios de aceite
- [ ] Cada evento gera e-mail e aviso uma única vez (teste); quem desligou não recebe e-mail.

## Notas técnicas
- —

## Notas de implementação
