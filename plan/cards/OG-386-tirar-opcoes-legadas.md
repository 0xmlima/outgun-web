# OG-386 — Tirar as opções legadas aprovadas na revisão

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S40 |
| Status | Pronto |
| Dependências | OG-385 |
| Regras de negócio | RN-UI-01, RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero uma tela de Opções curta, sem ajustes do original que ninguém usa, para achar rápido o que importa.

## Contexto
- Lista aprovada pelo PO em 2026-10-22 no OG-385 (as opções "em dúvida" ficam).

## Escopo
Sai da tela e das preferências (o valor passa a ser o padrão de hoje para todos; preferência salva antiga é ignorada sem erro):
- Jogo: banda para jogadores fora da sala; mostrar info do servidor ao conectar; ficar morto num menu no início da rodada.
- Gráficos: tema de cores, preferir cores do tema, tema de fundo, preferir fundo do tema ("Tema" fica só se houver mais de um); jogadores sumidos no minimapa; destacar bandeiras devolvidas e caídas; bandeiras extra-visíveis; posição de sumiço das bandeiras; destacar a si ao nascer; marcadores de vizinhos; caixa da área visível no mapa; vista passa da borda do mapa; repetir partes do mapa na tela; destacar mapas que não estão no jogo; transparência da tela de stats; modo info do mapa.
- Servidor: nomes de bot finlandeses (`bot_name_lang fi` vira só `classic`; a setting continua aceita no gamemod, sem efeito).
- Nada muda na partida para quem usa os padrões (RN-UI-05): `pnpm visual:check` sem diferença.

## Critérios de aceite
- [ ] As opções da lista não aparecem mais em Opções (menu e dentro da partida).
- [ ] Jogador com valor antigo salvo (navegador ou conta) vê o jogo como com o padrão.
- [ ] `visual:check` sem diferença na partida com as opções padrão.

## Notas de implementação
(preenchido durante a execução)
