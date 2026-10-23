# OG-396 — Steam: conquistas no app desktop, espelhando os marcos da conta

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S41 |
| Status | Concluído |
| Dependências | OG-390, D-77 |
| Regras de negócio | RN-SOC-07 |
| Skills | `outgun-card-workflow` |

## História
Como jogador do Outgun na Steam, quero que meus marcos virem conquistas da Steam, para elas aparecerem no meu perfil Steam.

## Contexto
- O app (`apps/desktop`, Electron 44, app 663760, OG-328) não usa o SDK da Steam. D-77: o marco do jogo é a fonte de verdade e o app só espelha.

## Escopo
- `steamworks.js` no processo principal: inicia com o app 663760 só quando o app foi aberto pela Steam; sem Steam, nada muda.
- Preload expõe `outgun.steam.sync(ids)`; o cliente chama ao entrar na conta e a cada relatório de partida com os marcos da conta. O app chama `activate` para cada API name ainda não desbloqueado e `storeStats` uma vez.
- API name = id do marco em maiúsculas (`matches_10` → `MATCHES_10`), tabela no `@outgun/content`.
- Retroativo de graça: quem já tem o marco ganha a conquista ao abrir o jogo.
- Empacotamento: binários nativos do `steamworks.js` fora do asar no Windows x64, macOS universal e Linux x64 (`dist:steam:*`).

## Critérios de aceite
- [ ] Pela Steam (branch `beta`), entrar numa conta com marcos desbloqueia as conquistas correspondentes; abrir sem Steam funciona como hoje.
- [x] Marco que não existe na Steam (ainda não cadastrado) é ignorado sem erro.

## Notas de implementação
- `steamworks.js` 0.4.0 (MIT) em `dependencies` do app, binários fora do asar (`asarUnpack`). Inicia só com `SteamAppId`/`SteamGameId` = 663760 no ambiente (a Steam põe ao abrir o jogo).
- Preload: `steamAvailable()` e `syncSteamAchievements(ids)`; o main valida a origem e o formato dos ids, desbloqueia o que falta e chama `stats.store()` uma vez.
- Site: ao entrar na conta manda todos os marcos (retroativo) e, a cada notificação de marco novo (OG-394), os da partida.
- Critério 1 (teste pela Steam na `beta`) fica para o PO, depois do cadastro (OG-397).
