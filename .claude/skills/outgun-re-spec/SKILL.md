---
name: outgun-re-spec
description: Extrai uma especificação fiel de um comportamento do Outgun original (C++) antes de portá-lo para a versão web. Use antes de implementar qualquer card de port (tipo "Port" no plan/PLAN.md), ao investigar uma regra de jogo, física, pontuação, power-up, bandeira, protocolo ou UI do original, ou quando código e documentação HTML divergirem.
---

# Outgun — engenharia reversa para spec

Objetivo: transformar código C++ do Outgun 1.0.3 em uma spec verificável em `plan/specs/<tema>.md`, sem perder detalhes que mudam o comportamento (ordem de operações, truncamentos, aleatoriedade, unidades).

## 1. Ler o código corretamente
Os fontes estão em **ISO-8859-1 com CRLF**. `grep`/`sed` falham silenciosamente ou dão "illegal byte sequence" sem ajuste:

```bash
LC_ALL=C tr -d '\r' < src/world.cpp | sed -n '1209,1276p'          # trecho com números de linha reais
LC_ALL=C tr -d '\r' < src/world.cpp | grep -n '^[A-Za-z].*::nome('  # achar definição
LC_ALL=C /usr/bin/grep -rna 'simbolo' src/                           # achar usos (use /usr/bin/grep: o grep do shell pode omitir resultados em ISO-8859-1)
```

Ponto de partida por assunto: seção 14 de `plan/PLAN.md` (mapa do código-fonte). Constantes globais: `src/commont.h:280-320`. Settings e faixas válidas: `src/server_settings.cpp`.

## 2. Rastrear completamente
Para a função-alvo:
1. Leia a definição inteira e **todas as chamadas** (`grep -rn`), inclusive callbacks (`PhysicsCallbacksBase`, `ServerPhysicsCallbacks`).
2. Identifique **onde no frame** ela roda: `ServerWorld::simulateFrame` (`world.cpp:3447`) define a ordem (powerup respawn → pré-física por jogador em ordem embaralhada → explosões de deathbringer → física → respawn → pós-física → pontos de posse → frags → tempo).
3. Liste cada setting lido (`config.*`, `pupConfig.*`, `physics.*`) e confirme default de código **e** valor no `config/gamemod.txt` (podem diferir — ver PLAN 2.4).
4. Anote toda chamada a `rand()`/`random_shuffle` e a ordem em que ocorrem (paridade depende disso).

## 3. Armadilhas conhecidas
- **Unidades:** 1 frame = 0,1 s. `get_time()` em segundos; `frame` em frames; settings em segundos viram frames `× 10` (`iround`). Regeneração/degradação usam `timeLeft = .1`.
- **Truncamentos:** `static_cast<int>` em dano, posição de origem de tiro e coordenadas enviadas na rede. Preserve-os.
- **Time = `pid / TSIZE`**, onde `TSIZE = maxplayers / 2`. Na web o time é campo explícito; documente a tradução.
- **Mundo toroidal:** `positiveModulo` na troca de sala e na distância entre salas.
- **Ordem de avaliação de argumentos:** em chamadas com mais de um `rand()` (ex.: `RoomCoords(rand() % w, rand() % h)`), o GCC do jogo avalia **da direita para a esquerda**: o primeiro `rand()` consumido é o do último argumento. Comprovado no OG-025. Casos conhecidos: `world.cpp:1965`, `mapgen.cpp:165/168`, `robot.cpp:750`. Inicializadores separados por vírgula numa declaração (`int a = rand(), b = rand();`) são avaliados em ordem.
- **Estado oculto em slots:** slots livres de power-up guardam posição e tempo antigos que não aparecem no trace; compare só o que tem efeito no jogo.
- **Código legado:** ramos com `protocolExtensionsLevel < 0` ou mensagens `data_old_*` são para clientes antigos — ignorar.
- **`#ifndef DEDICATED_SERVER_ONLY`**: código só de cliente (gráfico).
- **Pontuação** passa por `host->score_frag`/`score_neg` (servidor) — na sim web vira evento.
- **Docs HTML** (`doc/`) às vezes descrevem defaults antigos. O código vence; registre a divergência.

## 4. Escrever a spec
Crie/atualize `plan/specs/<tema>.md` com este formato:

```markdown
# Spec: <tema>
Card(s): OG-XXX · RNs: RN-...

## Resumo
Uma ou duas frases.

## Fonte
- `src/arquivo.cpp:inicio-fim` — Função::nome — o que faz
(toda afirmação abaixo deve ser rastreável a uma destas linhas)

## Settings e constantes
| Nome | Tipo | Faixa | Default código | Preset Clássico | Uso |

## Algoritmo
Pseudocódigo fiel, na mesma ordem de operações do C++ (inclusive ordem de chamadas a rand()).

## Posição no frame
Em que etapa de simulateFrame roda e o que já foi/será atualizado.

## Casos de borda
Lista numerada (valores zero, limites, empates, jogador morto, sob deathbringer, mudança de time no meio etc.).

## Divergências intencionais
O que a versão web fará diferente e por quê (também registrar em PLAN.md seção 12).

## Vetores de teste
Entradas → saídas esperadas, idealmente geradas pelo original (skill outgun-parity-harness).
```

## 5. Fechar o ciclo
- Se a spec revelar regra ausente ou errada no `plan/PLAN.md` seção 6, corrija a RN (com a citação) no mesmo PR.
- Linke a spec na seção "Notas de implementação" do card.
- Não modifique nada em `src/`, `maps/`, `config/` etc. do original: é a referência.
