// SPDX-License-Identifier: GPL-2.0-or-later
// Liga o tocador da trilha (OG-221) ao app: faixas do manifesto, primeiro gesto do jogador e o modo
// pedido por cada tela (`useMusicMode`).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadManifest } from '../../assets.js';
import { MusicPlayer, type MusicMode } from './player.js';

const MusicContext = createContext<MusicPlayer | null>(null);

export function MusicProvider({ children }: { readonly children: ReactNode }) {
  const [player] = useState(() => new MusicPlayer());
  useEffect(() => {
    let alive = true;
    void loadManifest().then((m) => alive && player.setTracks(m?.music ?? []));
    // política de autoplay: a música começa no primeiro gesto (tecla, clique ou toque)
    const unlock = () => player.unlock();
    for (const type of ['keydown', 'pointerdown', 'touchend'] as const) addEventListener(type, unlock, true);
    // para os testes manuais e do navegador (tools/visual-compare)
    (window as { __outgunMusic?: MusicPlayer }).__outgunMusic = player;
    return () => {
      alive = false;
      for (const type of ['keydown', 'pointerdown', 'touchend'] as const) removeEventListener(type, unlock, true);
    };
  }, [player]);
  return <MusicContext value={player}>{children}</MusicContext>;
}

export function useMusic(): MusicPlayer | null {
  return useContext(MusicContext);
}

/** A tela pede o que tocar enquanto estiver aberta (menu, partida Casual, nada). */
export function useMusicMode(mode: MusicMode): void {
  const player = useMusic();
  useEffect(() => {
    player?.setMode(mode);
  }, [player, mode]);
}
