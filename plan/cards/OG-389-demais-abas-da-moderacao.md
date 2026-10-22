# OG-389 — Demais abas da moderação no visual v2, na largura toda

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S40 |
| Status | Concluído |
| Dependências | OG-388 |
| Regras de negócio | D-70 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero que todas as abas da moderação sigam o mesmo visual e usem a tela toda, para trabalhar sem caçar campos soltos no canto da página.

## Contexto
- Pedido do PO em 2026-10-23, para fechar a ideia do OG-388: Salas ao vivo, Feedback, Rede e as outras abas ainda tinham campos e tabelas antigos encostados à esquerda.

## Escopo
- Salas ao vivo: barra fixa (motivo, minutos, ban de plataforma, mensagem a todas as salas) e uma ficha por sala lado a lado, com a lista de jogadores pela cor do time e as ações na linha.
- Feedback e Rede: números em blocos no topo; filtros na barra; tabela do design system.
- Denúncias, Clãs, Bans, Auditoria, Convites, Mapas: barra/painel com `TextField` e `Button`, tabelas no `Table`, ações compactas na linha. Mapas: envio à esquerda, publicados à direita.

## Critérios de aceite
- [x] Nenhuma aba da moderação usa `stats-table` nem os campos soltos antigos; todas preenchem a largura em 1920×1080 (capturas com `tools/visual-compare/admin-shots.mjs`).

## Notas de implementação
- Classes comuns: `admin-bar` (barra fixa), `admin-summary`, `admin-tiles`, `admin-cards`, `admin-panel`, `admin-row-actions`.
