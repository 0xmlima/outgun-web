# OG-442 — Tela congela depois da explosão do Deathbringer (de novo)

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S47 |
| Status | Concluído |
| Dependências | — |
| Issue | [#7](https://github.com/thiagovasconcellos/outgun-web/issues/7) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero continuar jogando depois de uma explosão de Deathbringer, para não ter de fechar e abrir o jogo.

## Contexto
- Issue #7 (área: Partida / HUD; gravidade: Médio; frequência: Às vezes).
- Versão: 2.46.3 · Dispositivo: computador · Navegador e sistema: app desktop/Steam no Windows · Sala / mapa: sala main, mapa Sisso · Data e hora: Mon Oct 26 2026 21:28:48 GMT+0000 (Europe/Lisbon) · Apelido no jogo: ozzylords
- Passos: 1. Morri pro deathbringer e meu jogo travou
- Esperado: Jogar normal
- Obtido: Deathbringer novamente travando
- Evidências: É essa ultima partida, que aconteceu nesse momento Última partida: https://outgunweb.com.br/matches/9e64c0c0-f39c-4001-b495-fc07c7a7a7f8
- Contorno: —

## Escopo
- Achar a exceção do desenho que o `guardFrame` (OG-428) só relatava e corrigi-la.

## Critérios de aceite
- [x] O erro do Sentry (OUTGUN-WEB-3, `entity-renderer.ts:137`) não acontece mais.
- [ ] PO confere numa partida com Deathbringer (dois ao mesmo tempo, ou um que passa da sala).

## Notas de implementação
- Causa (Sentry OUTGUN-WEB-3, release 2.46.3, 6 eventos, 21:28 do relato): as máscaras de sala do anel ficavam num array indexado por `índice·4 + sala`; um Deathbringer que pula o desenho (anel maior que a sala) ou que pega menos de 4 salas deixa buracos, e o `for…of` do começo do quadro achava `undefined`. Dali em diante todo quadro falhava e a tela parava (o `guardFrame` só relata uma vez). Agora é um `Map`.
- Sem teste automático: o renderer depende do PixiJS e não há teste com ele no cliente; o PO confere.
