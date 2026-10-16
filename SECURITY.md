# Segurança

Obrigado por ajudar a manter o Outgun Web seguro.

## Como relatar uma falha

Use o **relato privado de vulnerabilidades** do GitHub:
https://github.com/thiagovasconcellos/outgun-web/security/advisories/new

Não abra issue pública nem divulgue detalhes antes da correção. Descreva o que encontrou, como
reproduzir e o impacto que imagina. Respondemos em até 7 dias e avisamos quando a correção for
publicada; quem relatar recebe o crédito, se quiser.

## Escopo

- O jogo publicado em https://outgunweb.com.br (cliente web, API e servidor de jogo).
- Este repositório (código, configuração de deploy e CI).

Fora do escopo: ataques de negação de serviço por volume, engenharia social, falhas que exigem acesso
físico ou uma conta de administrador já comprometida, e trapaças que só usam o que o jogador já vê
na tela (o servidor é autoritativo; veja `plan/reports/OG-104-seguranca.md`).

Teste só com a sua própria conta e sem atrapalhar partidas de outros jogadores.

## Versões

Recebem correções a versão publicada (branch `v2`) e a 1.0 (branch `main`) enquanto estiver em uso.
