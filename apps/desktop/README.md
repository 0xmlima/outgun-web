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
