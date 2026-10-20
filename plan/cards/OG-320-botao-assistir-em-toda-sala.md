# OG-320 — Botão "Assistir" em toda sala, Casual e Ranked

| Campo | Valor |
|---|---|
| Épico | E8 |
| Tipo | Melhoria |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S30 |
| Status | Em andamento |
| Dependências | [OG-319](OG-319-espectador-em-sala-com-senha.md) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como espectador, quero um botão "Assistir" em qualquer sala da lista, para ver uma partida sem precisar de link de convite.

## Contexto
- Achado em 2026-10-20: o "Assistir ao vivo" só existe na página do convite (`/rooms/<id>`, `apps/web/src/screens/lobby.tsx:275`). Na lista do Ranked (`ranked-rooms.tsx`) não há botão, e clicar numa sala cheia não faz nada (`if (isFull(room)) return`). Na lista do Casual também não há.
- A tela do espectador fica preta e sem aviso até chegar o primeiro pacote da partida (o aviso de atraso só aparece com o `spectatorStart`).

## Escopo
- Botão "Assistir" em cada sala online das listas do Casual e do Ranked (inclusive cheia, em jogo ou com senha), além do que já existe na página do convite. Sem pedir conta nem senha.
- Tela do espectador: aviso "Conectando… a partida aparece depois do atraso" desde a abertura, até chegar a partida.
- Design system v2 (tokens do OG-200), nos dois temas de menu (Campo e Placar).

## Critérios de aceite
- [ ] Toda sala online das duas listas tem "Assistir", que abre `/spectate` com o `spectateUrl` dela.
- [ ] Sala Ranked cheia ou em jogo: "Assistir" funciona; "Entrar" segue bloqueado.
- [ ] A tela do espectador mostra o aviso de espera desde a abertura.
- [ ] Textos novos em todos os idiomas do catálogo.

## Notas técnicas
## Notas de implementação
