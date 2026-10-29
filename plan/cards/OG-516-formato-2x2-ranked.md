# OG-516 — Formato 2x2 no Ranked

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S56 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-RKL-01, RN-RKL-13, D-88 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero criar e entrar em salas Ranked 2x2, porque com pouca gente online o 2x2 é o que mais se joga e hoje não tem cenário oficial.

## Contexto
- Proposta 2x2 + OutCup (2026-10-29): artifact https://claude.ai/artifact/CUCHmHonx7Ss4NfXqUv5xf, cópia em `plan/specs/copa-2x2/proposta.html`; respostas do PO com a comunidade na D-88.
- P2: o 2x2 conta no rating único (D-65), como os outros formatos; a visão por formato (2x2, 3x3, 4x4, 5x5) mostra em qual modo cada jogador é bom.
- Formatos hoje: `RANKED_FORMATS` (`packages/settings/src/ranked.ts`), enum `ranked_format` (`apps/api/src/db/schema.ts:37`), `RankedFormatSchema`, `CHAMPION_BOARDS`.

## Escopo
- `2x2` como quarto formato: sala de 4 contas, começa só completa (D-40), md1/md3/md5, mesmo preset travado sem power-ups.
- Banco: valor novo no enum em **migração nova** (nunca editar migração existente).
- Cliente: escolha 2x2 ao criar sala Ranked e no filtro da lista; lobby com 2 por lado; abas "2x2" em estatísticas, leaderboard, radar e marcos por formato.
- Rating: partida 2x2 atualiza o OpenSkill único como as demais (RN-SKL-02).

## Critérios de aceite
- [x] Sala Ranked 2x2 criada, completada com 4 contas e jogada até o fim, com a partida no perfil e o rating atualizado (teste).
- [x] Abas e filtros por formato mostram 2x2.

## Notas técnicas
- Formatos são ordenados do menor para o maior em toda a UI (2x2 primeiro).

## Notas de implementação
- `2x2` entra em `RANKED_FORMATS` (primeiro da lista e padrão na criação), no enum `ranked_format` (migração 0048, valor novo não usado na mesma transação) e nos schemas/ticket; abas, filtros e painel seguem `RANKED_FORMATS`. Marco novo `win_2x2` ("Dupla de ataque").
- Quadros do ranking clássico (descontinuado, D-66) ficam sem 2x2.
