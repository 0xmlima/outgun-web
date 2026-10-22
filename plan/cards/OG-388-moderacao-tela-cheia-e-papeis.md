# OG-388 — Moderação em tela cheia: presets e rotações aproveitando a largura, papéis em lista

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S40 |
| Status | Em revisão |
| Dependências | OG-382, OG-383 |
| Regras de negócio | D-70 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero uma tela de moderação que use a largura do monitor e mostre as informações em listas claras, para montar presets, rotações e papéis sem rolar nem adivinhar.

## Contexto
- Revisão do PO em 2026-10-22 (5 capturas): o editor de preset ficou "confuso, messy e com bugs" (rótulos quebrando em 4 linhas, valor sobreposto ao texto), sobra muito espaço dos lados em Presets e Rotações, e Papéis é só um campo de texto. A tela usava o `TextPage` (texto corrido, 44rem).

## Escopo
- Moderação num `Page` de largura `full` (até 120rem).
- Presets: cabeçalho fixo com Nome, Descrição e Salvar; categorias em abas com contador; regras em cartões numa grade (3+ colunas); prévia e resumo fixos ao lado.
- Rotações: barra fixa com modo, formato, contador, marcar/desmarcar, desfazer e salvar; grade densa de cartões de mapa (10 por linha em 1920).
- Papéis: `GET /admin/users` (admin) com as contas por papel (admin, moderador, jogador) e nome, clã, criação e último acesso, busca pelo nome; papel muda na própria linha (não o seu).

## Critérios de aceite
- [x] Presets, Rotações e Papéis sem espaço vazio sobrando em 1920×1080 e legíveis em 1280×720 (capturas com `tools/visual-compare/admin-shots.mjs`).
- [x] Papéis lista as contas ordenadas por papel; teste da API cobre a ordem e a busca.

## Notas de implementação
- `tools/visual-compare/admin-shots.mjs` captura as abas no `pnpm dev:all` logado como Admin (PT ou EN).
- As outras abas (Salas ao vivo, Feedback, Mapas, Denúncias...) seguem no visual antigo (`stats-table`); ficaram largas mas alinhadas à esquerda — OG-389 se o PO quiser.
