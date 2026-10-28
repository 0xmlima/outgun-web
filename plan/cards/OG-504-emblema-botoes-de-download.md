# OG-504 — Botões "PNG 128/512 px" do emblema não dizem que baixam a imagem

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-489 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero entender de cara que os botões ao lado do emblema na página do clã baixam a imagem.

## Contexto
- Achado do PO (2026-10-28) em https://outgunweb.com.br/clans/DT: "PNG 128 PX" e "PNG 512 PX" (OG-489) são botões `ghost`, sem ícone nem verbo, e parecem texto solto.

## Escopo
- Rótulo "Baixar PNG (128 px)" / "Baixar PNG (512 px)" (i18n em `web-texts.ts`, PT e EN) com o ícone `download`, no padrão de "Baixar PDF" / "Baixar imagem do confronto".
- Página do clã (`apps/web/src/screens/clans.tsx`); o comportamento do download não muda.

## Critérios de aceite
- [ ] Os dois botões mostram o ícone de download e o verbo "Baixar", e o tamanho em px aparece no rótulo.
- [ ] Continuam baixando `emblema-<tag>-128.png` e `emblema-<tag>-512.png`.

## Notas de implementação
