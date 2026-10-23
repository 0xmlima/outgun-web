# Outgun para Windows, macOS e Ubuntu (OG-324, OG-326)

Uma janela do Electron que abre `https://outgunweb.com.br` (D-58). O jogo não vem no instalador:
cada deploy do site já vale para o cliente. Só gere instaladores novos quando esta pasta mudar
(por exemplo, para atualizar o Electron).

Fica **fora do workspace do pnpm** (dependências e lockfile próprios), para o `pnpm install` do
monorepo e do CI não baixar o Electron.

```sh
cd apps/desktop
npm ci
node node_modules/electron/install.js        # se o npm pulou o download do Electron
npm start                                   # abre o site de produção
OUTGUN_URL=http://localhost:5173/ npm start # contra o ambiente local
npm run dist:mac                            # dist/Outgun-mac-<versão>.dmg (universal; só no macOS)
npm run dist:linux                          # dist/Outgun-linux-<versão>.deb (Linux)
npm run dist:win                            # dist/Outgun-Setup-<versão>.exe (Windows; fora dele, precisa do Wine)
```

**FPS livre (OG-373, OG-400):** o cliente sempre liga `disable-frame-rate-limit` e
`disable-gpu-vsync` (sem opção de VSync; quem limita é o jogo, no mínimo 240 FPS). O `preload.cjs`
expõe ao site só `window.outgunDesktop` (modo de quadros e conquistas da Steam). Mudou `main.js` ou `preload.cjs`: gere instaladores e build da Steam novos.

Os instaladores oficiais saem do GitHub Actions (workflow "Cliente desktop", que roda a cada push
que muda esta pasta, um job por sistema). Baixe os artefatos e envie ao servidor:

```sh
bash deploy/vps/upload-desktop.sh root@<host> Outgun-Setup-<v>.exe Outgun-mac-<v>.dmg Outgun-linux-<v>.deb
```

Sem assinatura digital paga:

- **Windows:** o SmartScreen pede "Mais informações → Executar assim mesmo".
- **macOS:** assinatura ad hoc, sem notarização. Na primeira vez, o Mac bloqueia; o jogador vai em
  Ajustes do Sistema → Privacidade e Segurança → "Abrir mesmo assim".
- **Ubuntu:** `.deb` para 22.04 ou mais novo (x64); instala com dois cliques ou
  `sudo apt install ./Outgun-linux.deb`.

## Steam (OG-328, D-59)

O Outgun está na Steam como app **663760**, com um depot por sistema: **663761** (Windows),
**663762** (macOS) e **663763** (Linux + SteamOS). A Steam recebe a pasta do app, sem instalador:
o workflow "Cliente desktop" publica `outgun-steam-win|mac|linux` (`.tar.gz` de `win-unpacked/`,
`Outgun.app` universal e `linux-unpacked/`).

```sh
brew install --cask steamcmd
steamcmd +login <conta> +quit              # uma vez por máquina: senha e Steam Guard
STEAM_USER=<conta> pnpm steam:upload       # última execução do workflow com sucesso
STEAM_USER=<conta> pnpm steam:upload <run> # ou uma execução específica
```

O build entra só na branch `beta` (com senha). Para liberar a todos, o PO coloca o build na
`default` em Steamworks › SteamPipe › Builds; o build antigo (5426019, `outgun.exe`) é a volta atrás.
Opções de inicialização (Installation › General): `Outgun.exe` no Windows, `Outgun.app` no macOS e
`outgun` com o argumento `--no-sandbox` no Linux (a Steam não instala o `chrome-sandbox` com setuid,
e o Ubuntu 24.04 bloqueia o sandbox sem ele; a janela só abre o site do jogo).

No macOS, o SteamCMD do Homebrew vem com a marca de quarentena e o Gatekeeper diz que o
`Breakpad.framework` está danificado: `xattr -dr com.apple.quarantine /usr/local/Caskroom/steamcmd
~/Library/Application\ Support/Steam`.
