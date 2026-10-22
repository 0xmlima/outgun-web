# OG-366 — Envio de mapas .txt pelo painel de moderação

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S38 |
| Status | Pronto |
| Dependências | OG-365 |
| Regras de negócio | D-70 |
| Skills | `outgun-card-workflow`, `outgun-asset-pipeline` |

## História
Como moderador, quero enviar um mapa no formato .txt do Outgun (o que a comunidade já cria) e publicá-lo na hora, para que a comunidade participe ativamente do jogo.

## Contexto
- O formato é o do original (`P`, `S`, `flag`, `spawn`, `X`, `:rótulo`, `W`...) e o parser do OG-010 já o lê (o `1x1ctf.txt` de coiote & shadow passa). Hoje mapa novo só entra por versão nova (assets do cliente + pasta do servidor).

## Escopo
- Painel → "Mapas": enviar .txt (até 64 KB), validação pelo parser com os erros, prévia (título, autor, tamanho), nome do arquivo (o mesmo das rotações), publicar e desativar. Nome que já existe nos mapas do jogo é recusado; reenviar um mapa do painel cria versão nova.
- API: tabela própria (texto, CRC, autor, quem enviou, versões), migration reversível, auditoria; leitura pública do texto de um mapa publicado.
- Moderador publica direto (D-70).

## Critérios de aceite
- [ ] Testes da API: envio válido, inválido (erros do parser), nome repetido, desativar, permissão de moderador.
- [ ] O `1x1ctf.txt` do PO passa e aparece na lista.

## Notas de implementação
(preenchido durante a execução)
