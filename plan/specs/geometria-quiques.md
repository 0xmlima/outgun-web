# Spec: geometria, quiques e tempo até impacto
Card: OG-020 · RNs: RN-FIS-08, RN-FIS-09

## Resumo
Colisão contínua (sub-frame) de círculos em movimento contra as paredes de uma sala e entre círculos, base da física de jogadores e foguetes.

## Fonte
- `src/world.cpp:943-1067` — `bounceFromPoint`, `bounceFromLine`, `bounceFromArc`.
- `src/world.cpp:1069-1161` — `RectWall/TriWall/CircWall::tryBounce`.
- `src/world.cpp:347-373` — `Room::genGetTimeTillWall` (filtro por caixa do movimento + `tryBounce`).
- `src/world.cpp:1163-1207` — `getTimeTillBounce`, `getTimeTillWall` (foguete, raio 4) e as duas versões de `getTimeTillCollision`.

## Algoritmo
- Tempo `t` em unidades do vetor de movimento (1 = um frame); "sem impacto" = 1e99.
- **Ponto:** menor raiz de |t·m − d| = r, com t ≥ 0; contato = d − t·m.
- **Segmento:** distância do centro à reta = r; só vale se a projeção cair dentro do segmento (0 ≤ k ≤ 1); contato = d1 + k·diff − t·m.
- **Arco:** |t·m − d| = ar ± cr. Por fora usa a menor raiz; por dentro, a maior. Só vale dentro do setor (produto com `midvec` usando −y ≥ cos(meia-abertura)·raio).
- **Retângulo:** testa no máximo uma aresta vertical (conforme o sinal de m.x) e uma horizontal (sinal de m.y); só testa os cantos se nenhuma aresta foi atingida. A variável do resultado é reaproveitada entre os dois testes, como no original.
- **Triângulo:** três arestas e depois três vértices.
- **Círculo/anel/setor:** arco externo; arco interno (se ri > raio); se houver setor, as duas laterais e seus quatro cantos.
- Em todos, o candidato só substitui o atual se for **estritamente** mais cedo (`<`); em empate vale a parede que vem antes no mapa.
- **Sala:** parada → sem impacto; descarta paredes fora da caixa que envolve o início e o fim do movimento (`maxFraction`).
- **Jogador × foguete:** já sobrepostos → 0; **jogador × jogador:** já sobrepostos → sem colisão.

## Divergências intencionais
Nenhuma. O jogo distribuído foi compilado com `-ffast-math`, que troca algumas divisões por multiplicação pelo inverso; isso gera diferenças de até 1e-13 em ~30% dos impactos de parede. Compilado sem a flag (`outgun-oracle:nofastmath`), o original coincide **bit a bit** com o port em 100% dos casos.

## Vetores de teste
`packages/sim/src/map/__fixtures__/bounces.json` (`pnpm oracle fixture bounces ...`): 13.800 consultas de parede em todas as salas de todos os mapas (2.537 com impacto), 2.000 jogador × foguete e 2.000 jogador × jogador. Tolerância relativa de 1e-9 por causa do `-ffast-math`.
