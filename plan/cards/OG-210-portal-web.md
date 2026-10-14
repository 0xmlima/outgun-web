# OG-210 — Portal web público (fora do cliente do jogo)

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Infra |
| Prioridade | Won't (v2) |
| Estimativa | 5 pts |
| Sprint | — |
| Status | Cancelado |
| Dependências | [OG-200](OG-200-design-system-v2.md) |
| Regras de negócio | RN-SOC-01, RN-SOC-05 |
| Skills | `outgun-card-workflow` |

## História
> Cancelado em 2026-10-14 pelo PO (D-36): o jogo ainda é nichado; quando chegar a hora, o site público será feito num repositório dedicado. Perfil social e relatórios ficam no cliente atual, servidos junto do servidor do jogo.

Como jogador, quero abrir perfis, partidas e ranking num site normal, compartilhável por link, sem carregar o cliente do jogo.

## Contexto
- Hoje perfil, partida e ranking são telas do cliente (`screens/stats.tsx`, OG-085), alimentadas pela API (`/players/:nome`, `/players/:nome/matches`, `/matches/:id`).

## Escopo
- Novo app (`apps/portal` ou rotas públicas pré-renderizadas; decisão técnica D-36 no card) com os tokens e a fonte do OG-200.
- Páginas renderizadas no servidor com título, descrição e imagem de prévia (Open Graph) para links no Discord/WhatsApp.
- Rotas estáveis: `/jogadores/:nome`, `/partidas/:id`, `/ranking`, `/jogadores` (busca); domínio/caminho final segue o deploy de máquina única (OG-109).
- Cabeçalho com "Jogar" levando ao cliente; sessão do jogador reconhecida (destaca "você").
- Deploy em `deploy/` (Caddy + compose) e no beta.

## Critérios de aceite
- [ ] Página de exemplo publicada no beta, com prévia correta ao colar o link num chat.
- [ ] Carrega sem o bundle do jogo (< 200 KB de JS na primeira visita).
- [ ] Lighthouse ≥ 90 em desempenho e acessibilidade numa página de perfil.

## Notas técnicas
- O portal só lê dados públicos; nada de e-mail ou dado sensível (OG-104/OG-107).

## Notas de implementação
(preenchido durante a execução)
