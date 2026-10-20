# OG-322 — Faixas novas, rotação no menu e tocador na tela inicial

| Campo | Valor |
|---|---|
| Épico | E10 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S31 |
| Status | Concluído |
| Dependências | OG-220, OG-221, OG-222 |
| Regras de negócio | RN-MUS-01, RN-MUS-02, RN-MUS-05 |
| Skills | `outgun-asset-pipeline` |

## História
Como jogador, quero ouvir toda a trilha também nos menus e controlar a música da tela inicial.

## Contexto
- Pedido do PO em 2026-10-20: dez faixas novas em `songs/` (20 no total), com os metadados ID3 padronizados.
- O menu tocava só o tema em loop. Agora o tema abre a primeira vez em que a sessão do navegador toca música e depois as faixas se revezam. O tema continua fora das partidas.
- Crédito da trilha passa a "Thiago Anuszkiewicz" (mesmo autor, D-38), igual à tag de artista.

## Critérios de aceite
- [x] Pipeline lê título, artista, álbum e ano das tags ID3 (v2.3/v2.4) para o manifesto; 20 faixas.
- [x] Menu: tema na primeira vez da sessão (`sessionStorage`), depois rotação aleatória das outras faixas com crossfade; faixa da rotação segue do menu para a partida casual; o tema não entra na partida.
- [x] Tocador na tela inicial: título, artista · álbum · ano, progresso, pausar, próxima faixa e mudo (preferência `musicMuted`, sincronizada com a conta); mesma largura dos painéis da direita.
- [x] Créditos, `CREDITS.md` e `songs/LICENSE.txt` com "Thiago Anuszkiewicz".

## Notas
- `player.test.ts` cobre tema primeiro, rotação, partida, pausa, próxima, mudo e autoplay.
- Numa aba nova o tema volta a abrir (o `sessionStorage` é por aba).
