# OG-480 — Emblema do clã: modelo, molduras e desenho vetorial compartilhado

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S51 |
| Status | Em revisão |
| Dependências | OG-407 |
| Regras de negócio | RN-EMB-01, RN-EMB-02 |
| Skills | `outgun-card-workflow` |

## História
Como membro de um clã, quero um emblema com a cara do clã, montado de peças prontas, para o clã ser reconhecido pela forma e não só pela cor.

## Contexto
- Pedido da comunidade (2026-10-28): identidade visual do clã a partir de uma prancha enviada por um membro. Proposta discutida num artifact (https://claude.ai/artifact/1gbxDv1TRgpon4t9N1yeyF, cópia em `plan/specs/emblema-do-cla/proposta.html`); respostas na D-85.
- PO: todos os cards do emblema (OG-480 a OG-489) entram na mesma sprint.
- O montador da proposta (`plan/specs/emblema-do-cla/proposta.html`) já tem molduras, símbolos-rascunho e o desenho em SVG (quadro 100 × 100): é o ponto de partida.

## Escopo
- `packages/protocol/src/emblem.ts`: tipo `ClanEmblem` (`frame`, `symbol`, `fillet`, `inverted`), listas fechadas de molduras (escudo, círculo, losango, quadrado, octógono, estandarte, sem moldura; as do hall vêm no OG-488) e símbolos (`tag` + catálogo do OG-481), validação e `emblemSvg(emblem, tag, primary, secondary)` que devolve o SVG (contorno escuro, facetado, sombra curta do símbolo, filete), usado pelo portal, pelo PDF e pela partida.
- Tag como símbolo: 1 a 3 caracteres, tamanho da letra por quantidade, na fonte do design system.
- `emblemKey` para a unicidade (RN-EMB-02): moldura, símbolo, filete, cor do fundo e cor do símbolo **depois** da inversão (A invertido = B normal com as cores trocadas é o mesmo emblema).
- Emblema padrão de clã que nunca escolheu: escudo + tag com as cores do clã.

## Critérios de aceite
- [x] Testes: validação, `emblemKey` com inversão, padrão, tag de 1/2/3 caracteres.
- [x] O SVG é o mesmo em todos os lugares (uma função só).

## Notas técnicas
- Clã sem cores (`colors` null): emblema com cores neutras (prata e preto) até escolher; decidir na implementação e anotar.

## Notas de implementação
- `packages/protocol/src/emblem.ts`: ids em inglês (`shield`, `wolf`...), guardados no banco; os nomes de tela ficam no cliente. Catálogo com os 14 rascunhos da proposta; o OG-481 fecha os 28.
- Sem cores do clã: prata no fundo e preto no símbolo (`NEUTRAL_EMBLEM_COLOURS`).
- `emblemKey` com a tag como símbolo inclui a própria tag (tags distintas já dão emblemas distintos).
- Tag na fonte Inter (a do design system); o id do `clipPath` sai da chave, então o SVG é determinístico. O PDF (OG-485) precisa da Inter embutida para a tag sair igual.
