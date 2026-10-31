# OG-530 — OutCup: polimentos achados no teste de ponta a ponta

| Campo | Valor |
|---|---|
| Épico | E15 |
| Tipo | Melhoria |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-529 |
| Regras de negócio | RN-CUP-08, RN-CUP-11, RN-CUP-12 |
| Skills | `outgun-card-workflow` |

## História
Como jogador e como admin da OutCup, quero textos, datas e avisos sem ambiguidade, para a copa não depender de explicação no grupo.

## Contexto
- Achados do teste de ponta a ponta de 2026-10-31 (OG-529), nenhum bloqueia a primeira edição.

## Escopo
- Datas do calendário e do cabeçalho: quem está fora do Brasil vê "01/11 – 08/11" (fim da janela à meia-noite de Brasília cai no dia seguinte em Lisboa). Mostrar o horário de Brasília junto do local, como pedia o OG-524.
- Lobby da sala da copa: esconder "Pedir troca" (o servidor já ignora).
- Conta de fora que tenta entrar na sala da copa vê "Algo deu errado"; mostrar o motivo (`cup_room`: só os jogadores do confronto, mas pode assistir).
- E-mails da OutCup saem em inglês para contas sem idioma salvo no perfil; decidir o padrão (pt-BR?).
- Painel admin: estados crus em inglês (RUNNING, WALKOVER, DOUBLE_WALKOVER, DISPUTE, OPEN).
- Desfazer W.O. não avisa os jogadores; desfazer e dar resultado reenvia "Sua dupla e seu adversário" à dupla seguinte.
- Troca de jogador pelo admin: quem entra não tem horas marcadas e a dupla pode tomar W.O. no fim da janela; avisar no painel.
- Série que começa e não termina (queda do servidor, cancelamento D-62) deixa o confronto "ao vivo" até o admin dar o resultado; listar esses casos no painel.
- "1 inscritos" (singular).
- Marcos da OutCup datados no fim da edição (01/12), não no dia em que foram conquistados.

## Critérios de aceite
- [ ] Cada item acima resolvido ou descartado pelo PO.
