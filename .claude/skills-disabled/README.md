# Skills desativadas

Skills que só existiam para garantir a **fidelidade ao Outgun 1.0.3** durante o port (S0–S12). Desde a
v2 (2026-10-14) o jogo segue um caminho próprio e elas deixaram de ser obrigatórias. Ficam aqui, fora de
`.claude/skills/`, para que o Claude Code não as carregue, mas continuem disponíveis como referência.

| Skill | Por que saiu |
|---|---|
| `outgun-re-spec` | Extraía specs fiéis do C++ antes de cada card de port. Na v2 não há mais cards de port. |
| `outgun-parity-harness` | Comparava a sim TS com golden traces do original. Na v2 a física pode divergir de propósito (achados do beta). |

**Reativar:** `git mv .claude/skills-disabled/<skill> .claude/skills/`. Faz sentido para investigar como o
original se comportava (ex.: um veterano diz "no original era diferente" e queremos entender a diferença
antes de decidir). O código das ferramentas (`tools/parity/`, `_legacy/`) não foi removido.
