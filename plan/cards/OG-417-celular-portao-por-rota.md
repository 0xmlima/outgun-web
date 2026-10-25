# OG-417 — Celular de volta: portão por rota

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S45 |
| Status | Em revisão |
| Dependências | OG-209, OG-416 |
| Regras de negócio | RN-UI-01, RN-UI-08, D-80 |
| Skills | `outgun-card-workflow` |

## História
Como jogador no celular, quero abrir o Outgun e ver as telas do portal, para acompanhar o jogo fora do computador.

## Contexto
- Pedido do PO em 2026-10-25 (S45): o celular volta, mas sem a partida — estatísticas, perfis, relatórios em PDF e moderação, tudo no visual retrô da S44 (OG-416). D-80 substitui a D-50.
- Hoje `isPhone()`/`PhoneNotice` (`app/Shell.tsx`, OG-209) trocam o cliente inteiro pelo aviso, antes de qualquer rota.

## Escopo
- O aviso sai do `Root` e vira um portão por rota: no celular, as rotas do jogo (`/play`, `/spectate`, `/replay`, `/options/hud`, `/rooms/new`, `/rooms/ranked/new`, `/rooms/:id`, `/options`, `/controls`, `/download`) mostram o aviso "para jogar, abra no computador" com um botão de voltar ao início; as do portal (RN-UI-08) abrem normalmente.
- Links e botões que levam ao jogo (Jogar agora, Entrar na sala, Assistir, Ver replay) somem ou ficam desativados no celular, com o mesmo aviso ao tocar.
- O chunk do jogo (PixiJS) nunca é baixado no celular.

## Critérios de aceite
- [x] No celular, as rotas do portal abrem e as do jogo mostram o aviso (teste do portão por rota).
- [x] Desktop, app desktop e Steam não mudam.
- [x] D-80 registrada; RN-UI-01 e RN-UI-08 atualizadas no PLAN.

## Notas técnicas
- Manter a mesma detecção de `isPhone()` (toque sem mouse e lado menor < 600 px): tablets com teclado continuam como desktop.
- Lista das rotas do portal num lugar só (ex.: `app/device.ts`), usada pelo portão e pelos links.

## Notas de implementação
- `app/phone.ts`: `isPhone()` (saiu do `Shell.tsx`), `isPortalPath()` com a lista das rotas do portal e `PHONE_ADMIN_TABS` (OG-427). O `Root` troca só as rotas fora do portal pelo aviso, com "Voltar ao início"; como o `Outlet` nem monta, os chunks do jogo não são baixados.
- Barra de cima no celular: sem "Jogar agora" e só os links do portal (`useNavLinks` filtra). Links para replay/sala dentro das telas levam ao aviso.
