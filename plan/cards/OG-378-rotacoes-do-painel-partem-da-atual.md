# OG-378 — Aba Rotações parte da rotação que está valendo

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S40 |
| Status | Pronto |
| Dependências | OG-365 |
| Regras de negócio | D-69, D-70 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero ver na aba Rotações os mapas que estão valendo hoje e só acrescentar o mapa novo, para não ter de redigitar a rotação inteira nem tirar mapas sem querer.

## Contexto
- Sem rotação salva no painel, a caixa da Casual vem vazia e a tabela do Ranqueado vem toda desmarcada, embora o servidor use a sua (`ROTATION`, 20 mapas no beta). Para pôr o `purgatory` na Casual, o moderador teria de digitar os 20 mapas + o novo; salvar só o novo trocaria a rotação inteira por ele.

## Escopo
- O game server informa no heartbeat as rotações em uso (Casual e Ranqueado por formato); a API devolve isso em `GET /admin/rotations`; o painel começa os rascunhos por elas, marcando "padrão do servidor" enquanto não houver rotação salva.
- Mapa publicado na aba Mapas mostra um atalho "adicionar à rotação Casual / Ranqueado".

## Critérios de aceite
- [ ] Sem rotação salva, a aba mostra os mapas do servidor marcados; acrescentar um mapa e salvar mantém os outros.
- [ ] Teste da API cobre o heartbeat com as rotações.

## Notas de implementação
(preenchido durante a execução)
