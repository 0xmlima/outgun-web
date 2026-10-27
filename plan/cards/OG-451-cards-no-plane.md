# OG-451 — Cards espelhados no Plane

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Em revisão |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero ver o quadro de cards no Plane (sprints, épicos, status), para acompanhar e revisar o projeto num quadro visual em vez da tabela da seção 10.

## Contexto
- Plane Cloud, espaço `outgun`, projeto "Outgun". A chave fica fora do repositório (público): `~/.config/outgun/plane.env` (`PLANE_API_KEY`, `PLANE_WORKSPACE`, `PLANE_PROJECT`).
- A fonte de verdade continua sendo o repositório (`plan/PLAN.md` seção 10 e `plan/cards/`): o `set-status.py`, o `issues.mjs` e as skills leem os arquivos. O Plane é um espelho, só nesse sentido.

## Escopo
- `tools/dev/plane-sync.mjs`: cada card vira um item (título "OG-NNN — Título", texto do card na descrição, `external_id` = OG-NNN), status → estado, sprint → ciclo (sem datas), épico → módulo, prioridade Must/Should/Could → urgente/alta/média, pontos → etiqueta "N pts", dependências → "bloqueado por".
- Idempotente: roda de novo e só atualiza o que mudou; `--dry-run` mostra sem gravar; `--prune` apaga o que não veio dos cards (itens de exemplo, estados, ciclos, módulos e etiquetas soltos).
- Fluxo: rodar depois de mudar status e no fechamento da sprint (skill `outgun-card-workflow`).

## Critérios de aceite
- [x] Os itens de exemplo do Plane foram apagados e os 293 cards estão no projeto com estado, ciclo, módulo, prioridade, pontos e dependências.
- [ ] Rodar de novo sem mudanças não altera nenhum item.
- [x] Sem a chave no repositório.

## Notas de implementação
- Primeira carga em 2026-10-27 com `--prune`: 7 itens, 2 ciclos, 3 módulos, 4 estados e 2 etiquetas de exemplo apagados; 293 itens, 48 ciclos (S0–S47), 15 módulos, 212 itens com "bloqueado por". ~900 chamadas, uns 10 min (o tempo vai quase todo nas dependências).
- O Plane numera os itens sozinho (OUTGU-N); o OG-NNN fica no título e no `external_id`. Pontos viram etiqueta "N pts": a API pública não configura estimativas.
- O Plane reescreve o HTML da descrição; o script guarda o hash do texto enviado em `~/.cache/outgun/plane-sync.json` para não reenviar sem mudança. Dependência removida num card não sai do Plane (só acrescenta).
