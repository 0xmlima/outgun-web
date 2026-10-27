// SPDX-License-Identifier: GPL-2.0-or-later
// Ponte mínima entre o site e o cliente (OG-373): a página não ganha Node, só o modo do FPS (sempre
// livre desde o OG-400; as funções ficam para o site falar com clientes antigos e novos do mesmo
// jeito), a resolução do monitor no Windows (OG-401) e os ids dos marcos para as conquistas da Steam
// (OG-396).
// preload com sandbox só aceita CommonJS
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('outgunDesktop', {
  /** Sempre 'unlocked' desde o OG-400 (nos clientes antigos, o que está gravado). */
  frameRate: () => ipcRenderer.sendSync('outgun:frame-rate'),
  /** O modo que está valendo nesta abertura. */
  frameRateActive: () => ipcRenderer.sendSync('outgun:frame-rate-active'),
  setFrameRate: (mode) =>
    ipcRenderer.send('outgun:set-frame-rate', mode === 'unlocked' ? 'unlocked' : 'vsync'),
  /** Resolução do monitor (OG-401, só Windows): { modes, current, launch } ou null. */
  displayModes: () => ipcRenderer.sendSync('outgun:display-modes'),
  setDisplayMode: (mode) =>
    ipcRenderer.send('outgun:set-display-mode', typeof mode === 'string' ? mode : null),
  /** Abre um endereço http(s) no navegador do sistema (ex.: o site, que dentro do app abriria no próprio app). */
  openExternal: (url) =>
    ipcRenderer.send('outgun:open-external', typeof url === 'string' ? url : ''),
  /** Conquistas da Steam (OG-396): só quando a Steam abriu o jogo. */
  steamAvailable: () => ipcRenderer.sendSync('outgun:steam-available'),
  /** Ids dos marcos da conta; o app desbloqueia na Steam os que faltarem. */
  syncSteamAchievements: (ids) =>
    ipcRenderer.send(
      'outgun:steam-sync',
      Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [],
    ),
  /** Fecha o app (OG-444): no Windows ele abre em tela cheia, sem o botão da janela. */
  quit: () => ipcRenderer.send('outgun:quit'),
});
