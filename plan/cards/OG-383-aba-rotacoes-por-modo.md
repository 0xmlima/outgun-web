# OG-383 — Aba Rotações por modo: escolher Casual ou Ranqueado e marcar os mapas

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S40 |
| Status | Pronto |
| Dependências | OG-378 |
| Regras de negócio | D-69, D-70, RN-MOD-04 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero escolher o modo (Casual ou Ranqueado) e marcar os mapas da rotação numa grade com miniaturas, para pôr um mapa novo no jogo sem digitar nomes.

## Contexto
- Pedido do PO em 2026-10-22, depois de o `purgatory` não aparecer em "Criar sala" nem na votação: a Casual é uma caixa de texto (um mapa por linha) e a Ranqueada uma tabela por formato, uma embaixo da outra.
- Hoje marcar um mapa num formato sem rotação salva troca a rotação inteira do formato por aquele mapa (a tabela parte vazia); OG-378 faz a aba partir da rotação em uso.

- **Diretriz do PO (2026-10-22):** a tela de moderação tem de ser simples para qualquer moderador, não só para quem conhece o jogo a fundo: rótulos em português claro, sem exigir nomes de gamemod ou de arquivos, padrões à vista.

## Escopo
- Seletor no topo: **Casual** | **Ranqueado**.
- Casual: grade de mapas com miniatura e caixa de marcar (como "Criar sala"), todos os mapas do jogo + os publicados no painel; "marcar todos"/"desmarcar todos"; sem formato.
- Ranqueado: mesma grade com seletor de formato (3×3, 4×4, 5×5) ou as três colunas de caixas; aviso de que vale a partir da próxima troca de mapa.
- Contador de mapas marcados, "Salvar" e "Desfazer alterações"; não deixa salvar rotação vazia.
- Mapa publicado e ainda fora de toda rotação ganha selo "novo".

## Critérios de aceite
- [ ] Marcar um mapa publicado na Casual e salvar faz ele aparecer em "Criar sala" e na votação da partida, sem tirar os outros.
- [ ] Ranqueado: marcar um mapa num formato mantém os mapas que já estavam nele.

## Notas de implementação
(preenchido durante a execução)
