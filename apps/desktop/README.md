# Outgun para Windows (OG-324)

Uma janela do Electron que abre `https://outgunweb.com.br` (D-58). O jogo não vem no instalador:
cada deploy do site já vale para o cliente. Só gere um instalador novo quando esta pasta mudar
(por exemplo, para atualizar o Electron).

Fica **fora do workspace do pnpm** (dependências e lockfile próprios), para o `pnpm install` do
monorepo e do CI não baixar o Electron.

```sh
cd apps/desktop
npm ci
node node_modules/electron/install.js        # se o npm pulou o download do Electron
npm start                                   # abre o site de produção
OUTGUN_URL=http://localhost:5173/ npm start # contra o ambiente local
npm run dist                                # dist/Outgun-Setup-<versão>.exe (no Windows; no macOS/Linux precisa do Wine)
```

O instalador oficial sai do GitHub Actions (workflow "Cliente desktop", que roda a cada push que muda esta pasta): baixe o
artefato e envie ao servidor com `bash deploy/vps/upload-desktop.sh <arquivo.exe> root@<host>`
(OG-325). Sem assinatura digital: o Windows SmartScreen pede "Mais informações → Executar assim mesmo".
