# OG-364 — Quem matou quem: abates por vítima no relatório e no perfil

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Could |
| Estimativa | 2 pts |
| Sprint | S38 |
| Status | Concluído |
| Dependências | OG-362 |
| Regras de negócio | RN-SOC-02 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver quantas vezes matei (e morri para) cada adversário, para acompanhar as rivalidades da comunidade.

## Contexto
- Parte 3 do OG-356. O "matar o coiote vale mais que matar o Slim" da discussão do rating: não muda o rating, mas fica à vista.

## Escopo
- Relatório da partida: tabela de abates por vítima (matador × vítima) das ranqueadas com eventos.
- Perfil: "vítimas favoritas" e "quem mais te mata" no mês e sempre, respeitando quem esconde o histórico (D-39).
- pt-BR e inglês.

## Critérios de aceite
- [x] Relatório e perfil com e sem eventos (partidas antigas mostram "sem dados").
- [x] Privacidade: histórico escondido não aparece para os outros.

## Notas de implementação
- Relatório: "Abates por vítima" em "Estatísticas detalhadas" (linha = quem matou, coluna = vítima, todos os jogadores dos eventos, inclusive convidados e quem saiu); sem eventos mostra "Sem dados nesta partida."
- Perfil: painel "Quem matou quem" com abas "Este mês"/"Sempre" (mês = mês do calendário pelo fim da partida), top 10 de vítimas e de quem mais mata; só contas (sem bots/convidados) e sem quem esconde companheiros, como os rivais. `GET /players/:name/kills`; histórico escondido → `hidden` para os outros.
