# OG-395 — Ícones dos marcos gerados por script (perfil e Steam)

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Conteúdo |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S41 |
| Status | Pronto |
| Dependências | — |
| Regras de negócio | RN-SOC-06, RN-SOC-07 |
| Skills | `outgun-card-workflow`, `outgun-asset-pipeline` |

## História
Como jogador, quero um ícone para cada marco, para reconhecer as conquistas no perfil e na Steam.

## Contexto
- A Steam pede, por conquista, um ícone desbloqueado e um bloqueado (cinza), JPG/PNG quadrado (256×256 recomendado, 64×64 mínimo). O mesmo ícone serve ao perfil.

## Escopo
- Script em `tools/` que gera SVG por marco: moldura pela cor do grupo, nível (bronze/prata/ouro nos de total), símbolo do marco (bandeira, escudo, mira, relógio, foguete, clã...). Secretos com moldura própria.
- Saídas: SVG para o cliente (asset versionado) e PNG 256×256 desbloqueado + bloqueado para a Steam (`apps/desktop/steam/achievements/`).
- Ícones dos símbolos desenhados ou de conjunto com licença compatível (GPL/CC0), com a fonte registrada.

## Critérios de aceite
- [ ] Um ícone para cada id de `MILESTONES` (o script falha se faltar algum).
- [ ] PNGs da Steam nos dois estados, 256×256.

## Notas de implementação
