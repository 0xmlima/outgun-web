# OG-443 — Número do jogador some ao voltar para a partida

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S47 |
| Status | Concluído |
| Dependências | — |
| Issue | [#8](https://github.com/thiagovasconcellos/outgun-web/issues/8) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como jogador com número, quero continuar com ele ao voltar para a partida, para ser reconhecido em campo.

## Contexto
- Issue #8 (área: Partida / HUD; gravidade: Alto; frequência: Às vezes).
- Versão: 2.46.3 · Dispositivo: computador · Navegador e sistema: app desktop/Steam no Windows · Data e hora: Tue Oct 27 2026 00:50:20 GMT+0000 (Europe/Lisbon) · Apelido no jogo: ozzylords
- Passos: 1. Morrer para deathbringer. Preciso sair do jogo e abrir novamente. Quando faco isso, perco meu numero.
- Esperado: Jogar sem travar
- Obtido: Travou
- Evidências: Analisar partidas de ozzylords Última partida: https://outgunweb.com.br/matches/cab11bd7-ffe4-4da8-9bc1-b7f623470a58
- Contorno: —

## Escopo
- O travamento é o mesmo do OG-442.
- Ao voltar pela conta ou pelo token (`Room.resume`), o próprio número vem junto do nome e do clã; na volta da vaga do bot substituto, os outros recebem o número de novo.

## Critérios de aceite
- [x] Quem volta numa página nova recebe o próprio número (teste em `idle.test.ts`).
- [ ] PO confere: fechar o app no meio da partida, abrir de novo e ver o número.

## Notas de implementação
- O `join` anunciava o número, mas o `resume` só mandava nome e clã (OG-321); a página nova ficava sem o próprio número. Agora ele vai junto, no envio imediato.
- O travamento da issue foi tratado no OG-442.
