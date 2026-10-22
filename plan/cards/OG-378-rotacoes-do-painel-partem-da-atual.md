# OG-378 — Aba Rotações parte da rotação que está valendo

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S40 |
| Status | Em revisão |
| Dependências | OG-365 |
| Regras de negócio | D-69, D-70 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero ver na aba Rotações os mapas que estão valendo hoje e só acrescentar o mapa novo, para não ter de redigitar a rotação inteira nem tirar mapas sem querer.

## Contexto
- Sem rotação salva no painel, a caixa da Casual vem vazia e a tabela do Ranqueado vem toda desmarcada, embora o servidor use a sua (`ROTATION`, 20 mapas no beta). Para pôr o `purgatory` na Casual, o moderador teria de digitar os 20 mapas + o novo; salvar só o novo trocaria a rotação inteira por ele.

- Em 2026-10-22 o PO salvou no painel a rotação Casual (20 mapas + `purgatory`) como contorno; funcionou. O Ranqueado segue sem rotação salva (usa a do servidor).
- **Diretriz do PO (2026-10-22):** a tela de moderação tem de ser simples para qualquer moderador, não só para quem conhece o jogo a fundo: rótulos em português claro, sem exigir nomes de gamemod ou de arquivos, padrões à vista.

## Escopo
- O game server informa no heartbeat as rotações em uso (Casual e Ranqueado por formato); a API devolve isso em `GET /admin/rotations`; o painel começa os rascunhos por elas, marcando "padrão do servidor" enquanto não houver rotação salva.
- Mapa publicado na aba Mapas mostra um atalho "adicionar à rotação Casual / Ranqueado".

## Critérios de aceite
- [x] Sem rotação salva, a aba mostra os mapas do servidor marcados; acrescentar um mapa e salvar mantém os outros.
- [x] Teste da API cobre o heartbeat com as rotações.

## Notas de implementação
- Heartbeat manda `server.rotations` (as de `ROTATION`/`RANKED_ROTATION`, copiadas no boot); a API grava em `game_servers.rotations` (migração 0034) e `GET /admin/rotations` devolve `server` (o do último heartbeat).
- Painel: `rotationInUse` = do painel → do servidor (formato cai na `ranked`), com selo "(padrão do servidor)". Na aba Mapas, "Pôr na Casual"/"Pôr no Ranqueado" (este grava os três formatos).
- A grade por modo fica no OG-383.
