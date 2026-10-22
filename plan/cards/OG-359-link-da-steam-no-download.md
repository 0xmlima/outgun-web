# OG-359 — Link da Steam na página de download

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S37 |
| Status | Concluído |
| Dependências | OG-328 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver na página de download que o Outgun está na Steam, para instalar pela loja se preferir.

## Contexto
- Pedido do PO (2026-10-22): https://store.steampowered.com/app/663760/Outgun/

## Escopo
- Seção "Também na Steam" na página "Jogar no computador" (`/download`), entre os downloads e a instalação pelo navegador, com o botão "Abrir o Outgun na Steam" (nova aba; no app para computador abre o navegador do sistema). pt-BR e inglês.

## Critérios de aceite
- [x] Link para a página da loja, abrindo fora do site.

## Notas de implementação
- URL numa constante (`STEAM_STORE_URL`, `apps/web/src/screens/download.tsx`).
