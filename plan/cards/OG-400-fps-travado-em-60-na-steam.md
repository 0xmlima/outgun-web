# OG-400 — FPS travado em 60 no cliente da Steam

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S41 (2.41.1) |
| Status | Concluído |
| Dependências | OG-373, OG-374, OG-396 |
| Regras de negócio | D-73 |
| Skills | `outgun-card-workflow` |

## História
Como jogador com um computador que passa fácil de 60 FPS, quero o jogo sempre com o FPS livre no app da Steam, para ter menos atraso na tela.

## Contexto
- Achado do PO em 2026-10-23 na Steam (build 26149786): FPS preso em 60, e as opções de inicialização da Steam (`--disable-gpu-vsync` etc.) também não destravam.
- No macOS (Electron 44.5.1) as flags funcionam: 59 FPS sem elas, ~1300 com elas, com ou sem `desynchronized`. Só o Windows e a Steam não puderam ser medidos aqui. O que mudou desde o FPS livre da 2.39 é o canvas `desynchronized` (OG-374, 2.40: no Windows ele apresenta por um caminho próprio do Chromium) e o SDK da Steam ligado ao abrir o app (OG-396, 2.41). Some-se a opção de VSync gravada no `userData`, que prende quem a ligou.
- Regra do PO: "liberar geral", FPS no mínimo 240 em todas as plataformas possíveis.

## Escopo
- Desktop: `disable-frame-rate-limit` e `disable-gpu-vsync` sempre ligados, sem opção de VSync (o arquivo gravado deixa de valer). SDK da Steam só na primeira sincronização das conquistas, com a janela já desenhando.
- Web: sem o canvas `desynchronized`; limite de FPS nunca abaixo de 240 no desktop (automático 240, 360, 480, sem limite); no navegador o monitor manda (sem opções). Nos clientes 2.39/2.40 o site desliga o VSync gravado, e o FPS fica livre na próxima abertura.
- D-73 atualizada: sem opção de VSync.

## Critérios de aceite
- [ ] No app da Steam (Windows), o FPS passa de 60 num computador capaz, sem opção de inicialização (PO confere).
- [x] Opções → Gráficos sem "Sincronia vertical"; limite de FPS a partir de 240 no app.
- [x] Testes da web passam.

## Notas de implementação
- Se o Windows continuar em 60 com o build novo, o próximo suspeito é o overlay da Steam no processo da GPU: testar abrindo pelo `Outgun.exe` fora da Steam para separar.
