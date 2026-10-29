# OG-513 — Treino: bots do treino isolados dos bots do Casual

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S55 |
| Status | Pronto |
| Dependências | OG-491 |
| Regras de negócio | RN-TRN-03, RN-TRN-08, D-87 |
| Skills | `outgun-card-workflow` |

## História
Como comunidade que se diverte contra os bots do Casual, quero a garantia de que o modo treino não mexe neles, para o jogo continuar desafiador e competitivo como está.

## Contexto
- Revisão do PO (2026-10-29, D-87): os bots do treino funcionam separados dos bots do Casual. Podem herdar a inteligência dos atuais, mas os comportamentos de treino ficam só no treino. A jogabilidade contra os bots do Casual tem sido muito elogiada e não pode mudar.

## Escopo
- **Gravação de referência dos bots do Casual:** antes do OG-491, gravar as decisões (destino, mira, tiro e teclas) de bots dos níveis 1 a 5 em partidas simuladas com semente fixa, em mapas da rotação Casual; o teste compara frame a frame depois de cada card do treino. Qualquer diferença quebra o CI.
- **Fronteira de código:** `brain.ts`, `combat.ts`, `navigation.ts` e o resto do `Robot` não importam nada de `training/`; regra no lint (ou teste de import) garantindo isso. Nada de `if (treino)` dentro do bot do Casual.
- **Fronteira no servidor:** teste do `bot-client` mostrando que salas Casual, Ranked e bots substitutos criam `Robot`, e só a sala de treino cria `TrainingRobot`. Opções de treino (papel, trava de bandeira) ignoradas fora da sala de treino.
- Sem mudança de nível, de `botSkill` nem de `BOT_LEVELS` por causa do treino.

## Critérios de aceite
- [ ] Gravação de referência dos bots do Casual igual antes e depois do épico de treino, no CI.
- [ ] Lint/teste de import falha se o bot do Casual importar algo do treino.
- [ ] Teste do servidor: só a sala de treino usa o bot de treino.

## Notas de implementação
