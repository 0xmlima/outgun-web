# OG-346 — Jogadores demoram a aparecer ao entrar na sala

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S36 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver todo mundo assim que entro na sala.

## Contexto
- Relato do PO (2026-10-21): ao entrar na sala (no mapa), os outros jogadores levam alguns instantes para aparecer. Acontece no Casual e no Ranked; não é a lista do lobby.

## Escopo
- Medir o tempo entre entrar no mapa e ver os outros (bonecos e placar) e achar a causa: dados dos outros só no próximo ciclo de envio, espera do buffer de interpolação, ou nomes/lista vindo depois do primeiro frame.
- Mandar o estado completo dos jogadores junto da entrada, para que apareçam já no primeiro frame.

## Critérios de aceite
- [ ] Teste: o primeiro frame depois da entrada já traz os jogadores presentes.
- [ ] PO confere.

## Notas de implementação
