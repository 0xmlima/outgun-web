# OG-372 — Diagonal e Alt sem virar a arma por engano

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S39 |
| Status | Pronto |
| Dependências | OG-371 |
| Regras de negócio | D-72 |
| Skills | `outgun-card-workflow` |

## História
Como jogador experiente, quero que a diagonal e o Alt (esquiva) respeitem a intenção das minhas mãos, para que a arma não aponte para onde eu não queria quando as teclas não saem no mesmo milissegundo.

## Contexto
- A arma vira para a direção dos controles sempre que chega um input **sem** strafe (`gunDirectionFromControls`, `room.ts:941`). Humanos apertam e soltam "ao mesmo tempo" com 10–40 ms de diferença:
  - soltar a diagonal ↑→ soltando → antes de ↑: um input "↑" vira a arma para cima;
  - apertar seta e Alt juntos com a seta 10 ms antes: um input sem strafe vira a arma;
  - com Alt, o instante "sem direção" entre trocar ← por → zera o strafe (`clearModifiersIfIdle`).
- Com 10 Hz e um só reenvio isso já acontecia às vezes; com o envio por evento (OG-370/371) aconteceria **sempre**, então este card é obrigatório junto com eles.

## Escopo
- Janela de acorde no cliente (padrão 30 ms, opção "Tolerância de diagonal" em Controles, 0 a 60 ms; 0 = como hoje):
  - direção nova ou diagonal que perde um eixo vai ao servidor **com strafe provisório** durante a janela: o boneco anda na hora, só a arma espera; se o resto do acorde chegar (outra seta, Alt, soltar tudo), vale o acorde; senão, o estado real sai no fim da janela;
  - Alt solto com setas ainda seguradas segue a mesma regra.
- Tiro no meio da janela fecha a janela antes (a arma vira e o tiro sai na direção certa, na mesma mensagem ordenada).
- Strafe não muda a física (só a direção da arma), então o movimento não atrasa nem 1 ms; a predição aplica a mesma regra para não haver correção.
- D-72 na seção 12 (comportamento novo, sem equivalente no original).

## Critérios de aceite
- [ ] Soltar ↑→ com 25 ms de diferença mantém a arma na diagonal (teste com eventos sintéticos e no servidor).
- [ ] Seta 15 ms antes do Alt: a arma não vira.
- [ ] Seta sozinha vira a arma em até 30 ms; com a opção em 0, imediatamente.
- [ ] Movimento começa no mesmo tick que hoje (OG-369 não piora tecla→envio).

## Notas técnicas
- Todo o card é no cliente (`apps/web/src/game/input/` + `session`); o servidor não muda, então bots e replays ficam iguais.

## Notas de implementação
(preenchido durante a execução)
