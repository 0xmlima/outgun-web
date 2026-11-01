// SPDX-License-Identifier: GPL-2.0-or-later
// Caixa do placar no celular (experimental): deslizar o dedo para o lado passa por time vermelho, azul e
// chat. Os times são desenhados no canvas (HUD); o chat é HTML, para rolar e ter o campo de mensagem.
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { usePrefs } from '../app/prefs.js';
import type { GameHost } from '../game/host.js';
import type { ScoreboardPlace } from '../game/hud/screen-layout.js';
import { MAX_CHAT_LENGTH } from '../game/hud/online-hud.js';

/** Páginas: 0 time vermelho, 1 azul, 2 chat. */
const LAST_PAGE = 2;
/** Linhas guardadas para rolar para trás. */
const CHAT_LINES = 60;

export function PhoneBoard({ host, place, onTyping }: { readonly host: RefObject<GameHost | null>; readonly place: ScoreboardPlace; readonly onTyping: (typing: boolean) => void }) {
  const { t } = usePrefs();
  const [page, setPage] = useState(0);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => host.current?.setBoardPage(page), [host, page]);

  const down = (ev: PointerEvent<HTMLDivElement>) => {
    swipe.current = { x: ev.clientX, y: ev.clientY };
  };
  const up = (ev: PointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = ev.clientX - s.x;
    if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(ev.clientY - s.y)) setPage((p) => Math.max(0, Math.min(LAST_PAGE, p + (dx < 0 ? 1 : -1))));
  };

  return (
    <div
      className="phone-board"
      style={{ left: place.x1, top: place.y1, width: place.x2 - place.x1 + 1, height: place.y2 - place.y1 + 1 }}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={() => (swipe.current = null)}
    >
      {page === LAST_PAGE && <PhoneChat host={host} onTyping={onTyping} label={t('Message')} />}
      <div className="phone-board-dots" aria-hidden="true">
        {[0, 1, 2].map((p) => (
          <span key={p} aria-current={p === page} />
        ))}
      </div>
    </div>
  );
}

function PhoneChat({ host, onTyping, label }: { readonly host: RefObject<GameHost | null>; readonly onTyping: (typing: boolean) => void; readonly label: string }) {
  const [lines, setLines] = useState<{ team: number; text: string }[]>([]);
  const [text, setText] = useState('');
  const log = useRef<HTMLOListElement>(null);
  /** Rolado até o fim: as mensagens novas seguem aparecendo; rolado para cima, a posição fica. */
  const atEnd = useRef(true);
  useEffect(() => {
    const read = () => setLines(host.current?.chat(CHAT_LINES) ?? []);
    read();
    const id = setInterval(read, 500);
    return () => clearInterval(id);
  }, [host]);
  useEffect(() => {
    const el = log.current;
    if (el && atEnd.current) el.scrollTop = el.scrollHeight;
  }, [lines]);
  useEffect(() => () => onTyping(false), [onTyping]);

  return (
    <div className="phone-chat">
      <ol
        ref={log}
        className="phone-chat-log"
        aria-live="polite"
        onScroll={(ev) => {
          const el = ev.currentTarget;
          atEnd.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
        }}
      >
        {lines.map((l, i) => (
          <li key={i} className={l.team === 0 ? 'red' : l.team === 1 ? 'blue' : undefined}>
            {l.text}
          </li>
        ))}
      </ol>
      <form
        className="phone-chat-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          host.current?.say(text);
          setText('');
          atEnd.current = true;
        }}
      >
        {/* com o campo em foco o jogo não lê teclas (senão as letras viram comandos e chat da partida) */}
        <input
          aria-label={label}
          placeholder={label}
          value={text}
          maxLength={MAX_CHAT_LENGTH}
          enterKeyHint="send"
          autoComplete="off"
          onChange={(ev) => setText(ev.target.value)}
          onFocus={() => onTyping(true)}
          onBlur={() => onTyping(false)}
        />
      </form>
    </div>
  );
}
