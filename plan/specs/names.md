# Spec: nomes de jogador, proteção de nome e clan tag
Card(s): OG-082 (OG-081, OG-083) · RNs: RN-NOM-01, RN-NOM-02, RN-NOM-03

## Resumo
O nome em jogo é validado como no `check_name` do original. Nomes registrados são protegidos por uma
comparação normalizada derivada do `makeComparable` do `auth.txt`. A clan tag aparece como `(TAG) nome` no chat.

## Fonte
- `src/commont.h:53` — `maxPlayerNameLength = 15`.
- `src/commont.cpp:190-200` — `check_name`: tamanho ≤ 15; recusa nome só com espaços/NBSP (`" \xA0"`); recusa caractere não imprimível; recusa espaço ou NBSP na primeira ou na última posição.
- `src/utility.cpp:289-298` — `find_nonprintable_char` / `is_nonprintable_char`: `c < 32 || (128 ≤ c ≤ 159)` (byte Latin-1; 127 é aceito).
- `src/auth.cpp:88-101` — `AuthorizationDatabase::makeComparable`: percorre o nome; caractere `isalnum` → `tolower` e anexa; outro caractere → anexa `'.'` **só se já houver algo** no resultado; ao fim remove os `'.'` do final. Nome sem alfanumérico → `""`.
- `src/auth.cpp:144-146` — linha de `auth.txt` cujo nome comparável é vazio é inválida.
- `src/auth.cpp:210-228` — `identifyName` (igualdade de nomes comparáveis) e `checkNamePassword`: nome protegido exige a senha; nome não listado é aceito (`acceptUnlisted`).
- `src/servnet.cpp:3341-3365` — na conexão: `check_name` (falha = recusa sem explicação), depois a senha do jogador para nomes protegidos (`reject_player_password_needed` / `reject_wrong_player_password`).
- `src/server.cpp:1098-1135` — troca de nome em jogo: ignora se igual; anti-flood de 1 s (`waitnametime`); limpa a clan tag; `check_name` (falha = expulsão por mau comportamento); nome protegido sem senha → pede autenticação.
- `src/servnet.cpp:2383-2417` — a clan tag vem da resposta do master server de ranking (linha após `OK`), sem validação local.
- `src/server.cpp:1513-1515` — no chat: `"(" + clanTag + ") "` antes do nome, quando há tag.
- `src/server.cpp:932-965` — bots: prefixo `"BOT "` e nomes fora de uma lista negra (evita repetir).

## Settings e constantes
| Nome | Tipo | Faixa | Default código | Preset Clássico | Uso |
|---|---|---|---|---|---|
| `maxPlayerNameLength` | const | — | 15 | — | tamanho máximo do nome |
| `waitnametime` | interno | — | 1,0 s | — | intervalo mínimo entre trocas de nome em jogo |

## Algoritmo
```
checkName(name):                       # = check_name
  se len(name) > 15: falso
  se todos os caracteres ∈ {' ', NBSP}: falso      # inclui vazio
  se algum caractere não imprimível (Latin-1 <32 ou 128..159): falso
  se name[0] ∈ {' ', NBSP} ou name[-1] ∈ {' ', NBSP}: falso
  verdadeiro

makeComparable(name):                  # original, só ASCII (locale "C")
  r = ""
  para c em name:
    se c é [A-Za-z0-9]: r += minúsculo(c)
    senão se r ≠ "": r += '.'
  remove '.' do fim de r
```

## Divergências intencionais
1. **Caracteres fora de Latin-1** (code point > 255) são não imprimíveis na web: as fontes do jogo só têm Latin-1 (OG-013). No original, o nome é uma sequência de bytes Latin-1 e nunca tem esses caracteres.
2. **`comparableName` dobra acentos antes do `makeComparable`** (`É→e`, `ß→ss`, `Æ→ae`, `Ø→o`, `Ð→d`, `Þ→th`, `µ→u`...). No original, com o locale "C", letras acentuadas não são `isalnum` e viram `'.'`: `"José"` e `"Jos."` colidiam, mas `"José"` e `"Jose"` não. Na web, `"José"`, `"JOSE"` e `"jose"` são o mesmo nome, o que protege melhor contra imitação.
3. **Nome registrado = conta** (D-10, RN-NOM-02): no lugar de nome + senha no `auth.txt`, o nome de usuário da conta é o nome protegido; o game server recebe a identidade pelo ticket (OG-083). Um nome registrado precisa ter `comparableName` não vazio (como as linhas do `auth.txt`).
4. **Convidados** (RN-NOM-02): o nome escolhido não pode ter o mesmo `comparableName` de uma conta nem de um nome reservado; em jogo aparece com o sufixo `*` (o nome é cortado em 14 caracteres para caber). O `*` não muda o nome comparável: a proteção vem da checagem, não do sufixo, que só serve para todos verem que é convidado.
5. **Troca de nome** (nova): pela conta, no máximo uma a cada 30 dias. O nome antigo fica reservado para o dono por 90 dias: ninguém mais pode se registrar nem jogar como convidado com ele, e o dono pode voltar a usá-lo. Em jogo não se troca de nome (no original, a troca em jogo era livre, com 1 s de intervalo).
6. **Clan tag** (nova origem): definida pelo jogador na conta (no original vinha do master server). Regras: 1 a 6 caracteres, as mesmas de `checkName`, sem `(` nem `)` (a tag é exibida entre parênteses). Não é única: membros de um clã usam a mesma tag. Formato no chat igual ao original: `(TAG) nome: mensagem`.

## Casos de borda
1. `""`, `" "`, `"\xA0\xA0"` → inválidos. `"a b"` válido; `" a"`, `"a "`, `"a\xA0"` inválidos.
2. 15 caracteres válidos; 16 inválidos (contagem em caracteres Latin-1 = unidades UTF-16 para esse alfabeto).
3. `"\x7F"` (DEL) é aceito como no original; `"\x85"` não.
4. `makeComparable("..Ana..")` = `"ana"`; `("A  B")` = `"a..b"`; `("A.B")` = `"a.b"`; `("!!!")` = `""`.
5. Convidado `"ANA"` com conta `"Ana"` → recusado; `"Ana2"` → aceito, aparece como `"Ana2*"`.
6. Convidado com nome de 15 caracteres → os 14 primeiros + `*` (se o corte deixar espaço no fim, ele é removido para continuar válido).
7. Nome trocado há 10 dias → nova troca recusada até completar 30 dias.

## Vetores de teste
Os casos de borda acima estão em `packages/protocol/src/names.test.ts` (`checkName`, `makeComparable`, `comparableName`, `guestName`, `checkClanTag`), e as regras de conta em `apps/api/src/routes/names.test.ts`.
