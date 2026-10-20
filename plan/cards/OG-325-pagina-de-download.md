# OG-325 — Página "Jogar no computador" e download do instalador

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S32 |
| Status | Pronto |
| Dependências | OG-323, OG-324 |
| Regras de negócio | D-58 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero achar no site como instalar o Outgun no computador.

## Contexto
- O repositório é privado: os releases do GitHub não são públicos. O instalador fica no próprio servidor (`/opt/outgun/downloads`, servido pelo Caddy em `/download/`).

## Escopo
- Página `/download` com as duas opções: instalar pelo navegador (OG-323) e baixar o `.exe` (OG-324), com o aviso do SmartScreen explicado ("Mais informações → Executar assim mesmo").
- Link no rodapé e item no menu principal; dentro do cliente desktop a página diz que ele já está instalado.
- `deploy/vps`: Caddy serve `/download/*` da pasta do servidor; script para enviar um instalador novo.

## Critérios de aceite
- [ ] `https://outgunweb.com.br/download/Outgun-Setup.exe` baixa o instalador atual.
- [ ] A página explica as duas opções em pt-BR e esconde o botão de instalar quando o navegador não oferece.

## Notas de implementação
