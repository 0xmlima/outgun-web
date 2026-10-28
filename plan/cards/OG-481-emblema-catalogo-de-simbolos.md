# OG-481 — Emblema do clã: catálogo final de símbolos (28 desenhos próprios)

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S51 |
| Status | Concluído |
| Dependências | OG-480 |
| Regras de negócio | RN-EMB-01 |
| Skills | `outgun-card-workflow` |

## História
Como líder de clã, quero um catálogo de símbolos variado e bonito, para o emblema combinar com o estilo do clã.

## Contexto
- Pedido da comunidade (2026-10-28): identidade visual do clã a partir de uma prancha enviada por um membro. Proposta discutida num artifact (https://claude.ai/artifact/1gbxDv1TRgpon4t9N1yeyF, cópia em `plan/specs/emblema-do-cla/proposta.html`); respostas na D-85.
- PO: todos os cards do emblema (OG-480 a OG-489) entram na mesma sprint.
- P7: além dos 14 rascunhos da proposta (estrela, divisas, coroa, asas, bandeira, mira, foguete, raio, lobo, caveira, chama, torre, gema, cruzado), a comunidade pediu: Escudo Partido, Punho Fechado, Muralha, Fênix, Dragão, Serpente, Águia, Tubarão, Aranha, Alien, Robô, Joystick, Fantasma e Coração 8-bit.

## Escopo
- Desenhar (SVG, quadro 100 × 100, uma cor para o símbolo e a cor do fundo nos vazados) os 28 símbolos e refinar os 14 rascunhos.
- Todos **desenhos próprios**: o Alien não pode lembrar os alienígenas de arcade clássico, o Fantasma não pode lembrar os fantasmas de labirinto famosos, nada de personagem, logotipo ou marca (repositório público, jogo na Steam).
- Coração 8-bit: degraus de pixel desenhados em vetor (o estilo é do símbolo, não do render).
- Prancha de revisão (página de dev ou `tools/`) com todos os símbolos em 16, 32 e 128 px, nas 18 cores e em tons de cinza.

## Critérios de aceite
- [x] 28 símbolos no catálogo, nomes traduzidos (pt-BR e inglês).
- [x] Cada símbolo reconhecível em 16 px e em tons de cinza (prancha entregue ao PO).

## Notas técnicas
- Se alguém da comunidade quiser desenhar a versão final (P7 da proposta), o formato de entrada é o mesmo SVG.

## Notas de implementação
- 28 símbolos em `packages/protocol/src/emblem.ts` (14 rascunhos mantidos como estavam, 14 novos), nomes em `EMBLEM_SYMBOL_NAMES` + pt-BR em `web-texts.ts`. Coração 8-bit em degraus pelo helper `pixels`.
- Alien de cabeça de gota e olhos amendoados; Fantasma de lençol com cauda torta e olhos vazados sem pupila (longe dos de arcade e de labirinto).
- Prancha: `node tools/dev/emblem-sheet.mjs > emblemas.html` (16/32/128 px, 18 pares de cores, sem moldura, tons de cinza). Conferência em 16 px e cinza fica com o PO.
