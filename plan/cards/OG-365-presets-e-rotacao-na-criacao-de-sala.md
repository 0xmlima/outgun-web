# OG-365 — Presets do painel e rotação oficial na criação de sala

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S38 |
| Status | Em revisão |
| Dependências | OG-087 |
| Regras de negócio | RN-CFG-03, D-69, D-70 |
| Skills | `outgun-card-workflow` |

## História
Como moderador, quero que os presets que crio no painel e a rotação que defino valham na criação de salas, para que a comunidade jogue com as regras e os mapas combinados.

## Contexto
- Achado do PO na S38: preset criado no painel não aparece em "Criar sala". Causa: a tela usa a lista fixa dos presets do código (`CASUAL_PRESETS`, desde o OG-069/OG-203) em vez de `GET /presets`, que já devolve os do painel; API e game server já aceitam o preset.
- A sala privada escolhe mapas entre todos os do jogo, ignorando a rotação do painel.

## Escopo
- "Criar sala" lista os presets de `GET /presets` (código + painel), com a descrição como dica.
- Rotação sempre respeitada (D-69): a sala privada escolhe mapas só entre os da rotação Casual do painel (sem escolha = rotação inteira); a API recusa mapa fora da rotação; o game server aplica a interseção também nas salas abertas quando a rotação muda (se não sobrar nenhum, a rotação inteira). Sem rotação no painel, continua a escolha livre.
- Permissões (D-70): moderador cria/edita/desativa presets e edita rotações (hoje só admin), com auditoria.

## Critérios de aceite
- [x] Preset criado no painel aparece em "Criar sala" e a sala abre com ele.
- [x] Mapa fora da rotação é recusado pela API; sala aberta segue a rotação nova na próxima troca de mapa.
- [x] Moderador salva preset e rotação; testes da API cobrem as permissões.

## Notas de implementação
- Causa do bloqueio: lista fixa `CASUAL_PRESETS` na tela (OG-069/OG-203); agora a tela lê `GET /presets` (fica a lista do código até a resposta chegar).
- Rotação (D-69): `GET /rotation` (null = sem rotação Casual no painel, escolha livre); `POST /rooms` recusa mapa fora dela (`map_not_in_rotation`). No game server, `panelRotationKeys` marca as rotações vindas do painel; a sala guarda os mapas escolhidos (`chosenMaps` no gerenciador) e, quando a rotação muda, toda sala do modo (não só as fixas) recebe a interseção ou a rotação inteira na próxima troca de mapa.
- Permissões (D-70): moderador salva/desativa presets e salva rotações (API e painel); continua auditado.
