# OG-526 — OutCup: prazos, W.O. e ferramentas do admin

| Campo | Valor |
|---|---|
| Épico | E15 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S56 |
| Status | Em revisão |
| Dependências | OG-525 |
| Regras de negócio | RN-CUP-10, RN-CUP-11, D-88 |
| Skills | `outgun-card-workflow` |

## História
Como organização, quero que a copa ande sozinha mesmo quando alguém some, e poder intervir nos casos estranhos.

## Contexto
- Proposta 2x2 + OutCup (2026-10-29): artifact https://claude.ai/artifact/CUCHmHonx7Ss4NfXqUv5xf, cópia em `plan/specs/copa-2x2/proposta.html`; respostas do PO com a comunidade na D-88.
- P10: confirmado o horário, quem não comparece toma W.O.; se as duas ficam de fora, as duas são eliminadas.

## Escopo
- Jogo marcado: dupla incompleta 15 min depois do horário perde por W.O.; nenhuma das duas → W.O. duplo.
- Fim da janela sem jogo marcado: vence a dupla que marcou disponibilidade (os dois jogadores) se a outra não marcou; nenhuma marcou → W.O. duplo; as duas marcaram sem horário em comum → vai para o admin.
- Painel admin: remarcar, dar o resultado, trocar um jogador de uma dupla por outro inscrito, desfazer W.O., com auditoria.

## Critérios de aceite
- [x] Cada caminho de W.O. aplicado na virada da janela e no atraso de 15 min (teste).

## Notas técnicas
- Interpretação a confirmar: as duas duplas marcaram horários sem cruzamento → decisão do admin.

## Notas de implementação
- W.O. no relógio: atraso de 15 min pelo roster da sala (só sem série começada); fim da janela pela disponibilidade marcada; as duas marcaram sem horário em comum → `dispute` (com o admin, interpretação a confirmar). Admin: abrir, cancelar, datas, resultado, remarcar (com janela nova), trocar jogador e desfazer W.O.; tudo na auditoria.
