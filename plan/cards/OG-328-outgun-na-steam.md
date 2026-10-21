# OG-328 — Outgun na Steam (cliente Electron por cima do jogo antigo)

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S33 |
| Status | Concluído |
| Dependências | OG-324, OG-326 |
| Regras de negócio | — (D-59) |
| Skills | `outgun-card-workflow` |

## História
Como jogador que tem o Outgun na Steam, quero receber a versão nova pela própria Steam, no Windows, no macOS e no Linux.

## Contexto
- App **663760** no Steamworks (pacotes ainda com o nome antigo "Megablazer": 188374, 188375 e 188376). A branch `default` está no build 5426019 (`outgun.exe`, 2020), que serve de volta atrás.
- Depots: **663761** Windows, **663762** macOS, **663763** Linux + SteamOS. O PO criou os dois últimos e incluiu nos pacotes em 2026-10-20.
- A Steam recebe a pasta do app pronta (sem instalador): `win-unpacked/`, `Outgun.app` universal e `linux-unpacked/`.

## Escopo
- Alvos `dir` no electron-builder (`dist:steam:win|mac|linux`) e um job no workflow "Cliente desktop" que publica os três como artefatos `.tar.gz` (o artefato do Actions perde symlinks e bits de execução, que o `.app` precisa).
- `apps/desktop/steam/`: `app_build_663760.vdf`, um `depot_build_<id>.vdf` por depot e `upload.sh`, que baixa os artefatos de uma execução do workflow (`gh run download`), extrai e roda o SteamCMD. O build entra **só na branch `beta`**. A `default` é promovida à mão pelo PO no Steamworks.
- `pnpm steam:upload` na raiz.

## Critérios de aceite
- [x] `STEAM_USER=<conta> pnpm steam:upload` envia os três depots e deixa o build na branch `beta`.
- [x] Pela Steam, com a senha da `beta`, o Outgun abre e conecta ao site no Windows, no macOS e no Linux.
- [x] Nada muda na `default` até o PO promover o build.

## Notas de implementação
- Primeiro envio em 2026-10-20: BuildID 26090773 na `beta` (run 39499360348); o PO testou pela Steam e funcionou.
- O CI empacota as pastas que o electron-builder já deixa em `dist/` ao gerar os instaladores (sem build extra); `dist:steam:*` fica para gerar localmente.
- Linux abre com `--no-sandbox` (opção de inicialização no Steamworks): a Steam não instala o `chrome-sandbox` com setuid.
- Para liberar a todos (PO, no Steamworks): build na `default`, apagar a opção antiga do `outgun.exe`, limpar o Beta Branch das novas, marcar macOS e Linux em Supported OS e preencher os requisitos na página da loja.
