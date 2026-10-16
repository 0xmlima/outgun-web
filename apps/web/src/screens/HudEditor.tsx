// SPDX-License-Identifier: GPL-2.0-or-later
// Editor do HUD Personalizado (OG-300, D-55, RN-UI-07): a tela inteira é a partida de exemplo; cada
// componente se arrasta, cresce pelo canto e pode ser escondido. Nenhum componente fica sobre a sala:
// solto em cima dela, volta para onde estava.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { hudScaleValue } from '../game/graphics-options.js';
import { drawPreview, type PreviewTexts } from '../game/hud/hud-preview.js';
import { CUSTOM_SCALE_MAX, CUSTOM_SCALE_MIN, HUD_COMPONENTS, type HudComponent, type HudRoom } from '../game/hud/hud-style.js';
import { customArrangement, customFromPlaces, customRoom, outsideRoom, startingPlaces, type Place, type Places } from '../game/hud/modern-layout.js';
import { autoHudScale } from '../game/hud/screen-layout.js';
import type { Rect } from '../game/render/layout.js';
import { Button } from '../ui/Button.js';

const LABELS: Record<HudComponent, string> = {
  score: 'Team score and clock',
  minimap: 'Minimap',
  health: 'Health',
  energy: 'Energy',
  powerups: 'Power-ups and weapon',
  chat: 'Chat',
  fps: 'FPS',
};

const GRID = 8;
const MARGIN = 8;

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Encaixa na grade e nas margens da tela e da sala. */
function snap(v: number, size: number, max: number, edges: readonly number[]): number {
  for (const e of [MARGIN, max - MARGIN - size, ...edges.flatMap((x) => [x, x - size])]) if (Math.abs(v - e) < GRID * 1.5) return clamp(Math.round(e), 0, max - size);
  return clamp(Math.round(v / GRID) * GRID, 0, max - size);
}

interface Drag {
  readonly id: HudComponent;
  readonly resize: boolean;
  readonly px: number;
  readonly py: number;
  readonly start: Place;
}

export default function HudEditorScreen() {
  const { t, prefs, setPrefs } = usePrefs();
  const navigate = useNavigate();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(() => ({ W: innerWidth, H: innerHeight }));
  const { W, H } = size;
  const u = hudScaleValue(prefs.hudScale) ?? autoHudScale(W, H);
  const [room, setRoom] = useState<HudRoom>(prefs.hudCustom.room);
  const [places, setPlaces] = useState<Places>(() => customArrangement(W, H, u, prefs.hudCustom).places);
  const [hidden, setHidden] = useState<ReadonlySet<HudComponent>>(() => new Set(prefs.hudCustom.comps ? HUD_COMPONENTS.filter((id) => !prefs.hudCustom.comps![id].visible) : []));
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<HudComponent | null>(null);
  const roomRect = useMemo(() => customRoom(W, H, room), [W, H, room]);
  const texts = useMemo<PreviewTexts>(
    () => ({
      health: t('Health'),
      energy: t('Energy'),
      weapon: t('Weapon'),
      pups: [t('Power'), t('Turbo'), t('Shadow')],
      chat: [
        { text: t('This map is $1.', 'The Blunt') },
        { who: 'Duda', team: 0, text: t('Hold the base, I will get the flag') },
        { who: 'Gabi', team: 1, text: t('Someone go back to defense') },
      ],
    }),
    [t],
  );

  // a tela mudou de tamanho: os componentes saem de cima da sala e ficam dentro da tela
  useEffect(() => {
    const onResize = () => setSize({ W: innerWidth, H: innerHeight });
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);
  const fitAll = useCallback(
    (from: Places, r: Rect, w: number, h: number, fallback: Places): Places => {
      const out: Places = {};
      for (const id of HUD_COMPONENTS) {
        const p = from[id];
        if (!p) continue;
        const inside = { ...p, x: clamp(p.x, 0, Math.max(0, w - p.w)), y: clamp(p.y, 0, Math.max(0, h - p.h)) };
        const moved = outsideRoom(inside, r, w, h);
        const f = fallback[id];
        if (moved) out[id] = { ...moved, s: p.s };
        else if (f) out[id] = f;
      }
      return out;
    },
    [],
  );
  const firstSize = useRef(true);
  useEffect(() => {
    if (firstSize.current) {
      firstSize.current = false;
      return;
    }
    // só na troca de tamanho da tela
    setPlaces((old) => fitAll(old, customRoom(W, H, room), W, H, startingPlaces(W, H, u, room)));
  }, [W, H]);

  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = devicePixelRatio || 1;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPreview(ctx, W, H, roomRect, places, texts);
  }, [W, H, roomRect, places, texts]);

  const cancel = useCallback(() => void navigate('/options/graphics'), [navigate]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') cancel();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [cancel]);

  const save = () => {
    setPrefs({ hudCustom: customFromPlaces(W, H, room, places, hidden), hudStyle: 'custom' });
    cancel();
  };
  const restore = () => {
    setRoom('left');
    setHidden(new Set());
    setPlaces(startingPlaces(W, H, u, 'left'));
  };
  // trocar a sala recomeça do Moderno ajustado a ela (empurrar cada componente embolaria as laterais)
  const changeRoom = (next: HudRoom) => {
    setRoom(next);
    const start = startingPlaces(W, H, u, next);
    setPlaces(Object.fromEntries(HUD_COMPONENTS.filter((id) => !hidden.has(id) && start[id]).map((id) => [id, start[id]])) as Places);
  };
  const toggle = (id: HudComponent) => {
    const next = new Set(hidden);
    if (next.has(id)) {
      next.delete(id);
      // volta no lugar de partida (ou no mais próximo dele fora da sala)
      const start = startingPlaces(W, H, u, room)[id];
      if (start) setPlaces((old) => ({ ...old, [id]: start }));
    } else {
      next.add(id);
      setPlaces((old) => {
        const copy = { ...old };
        delete copy[id];
        return copy;
      });
    }
    setHidden(next);
  };

  const onDown = (ev: ReactPointerEvent, id: HudComponent, resize: boolean) => {
    const start = places[id];
    if (!start) return;
    ev.preventDefault();
    ev.stopPropagation();
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    setSelected(id);
    setDrag({ id, resize, px: ev.clientX, py: ev.clientY, start });
  };
  const onMove = (ev: ReactPointerEvent) => {
    if (!drag) return;
    const dx = ev.clientX - drag.px;
    const dy = ev.clientY - drag.py;
    const s0 = drag.start;
    let next: Place;
    if (drag.resize) {
      const f = clamp((s0.w + dx) / s0.w, (CUSTOM_SCALE_MIN * u) / s0.s, Math.min((CUSTOM_SCALE_MAX * u) / s0.s, (W - s0.x) / s0.w, (H - s0.y) / s0.h));
      next = { x: s0.x, y: s0.y, w: Math.round(s0.w * f), h: Math.round(s0.h * f), s: s0.s * f };
    } else {
      const edges = [roomRect.x, roomRect.x + roomRect.w];
      const yEdges = [roomRect.y, roomRect.y + roomRect.h];
      next = { ...s0, x: snap(s0.x + dx, s0.w, W, edges), y: snap(s0.y + dy, s0.h, H, yEdges) };
    }
    setPlaces((old) => ({ ...old, [drag.id]: next }));
  };
  const onUp = () => {
    if (!drag) return;
    const p = places[drag.id];
    // em cima da sala não pode (D-55): volta para onde estava
    if (p && overlaps(p, roomRect)) setPlaces((old) => ({ ...old, [drag.id]: drag.start }));
    setDrag(null);
  };

  const panelW = Math.min(roomRect.w - 32, 520);
  return (
    <div className="hud-editor" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <canvas ref={canvas} className="hud-editor-canvas" style={{ width: W, height: H }} aria-hidden="true" />
      <div className="hud-editor-room" style={{ left: roomRect.x, top: roomRect.y, width: roomRect.w, height: roomRect.h }} aria-hidden="true" />
      {HUD_COMPONENTS.map((id) => {
        const p = places[id];
        if (!p) return null;
        const bad = overlaps(p, roomRect);
        return (
          <div
            key={id}
            className={`hud-editor-box${selected === id ? ' is-selected' : ''}${bad ? ' is-blocked' : ''}`}
            style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
            onPointerDown={(ev) => onDown(ev, id, false)}
            role="button"
            tabIndex={0}
            aria-label={t(LABELS[id])}
            onFocus={() => setSelected(id)}
          >
            <span className="hud-editor-label">{t(LABELS[id])}</span>
            <span className="hud-editor-handle" onPointerDown={(ev) => onDown(ev, id, true)} aria-hidden="true" />
          </div>
        );
      })}
      <section
        className="hud-editor-panel"
        style={{ left: roomRect.x + (roomRect.w - panelW) / 2, top: roomRect.y + roomRect.h / 2, width: panelW }}
        aria-label={t('Edit custom HUD')}
      >
        <h1>{t('Edit custom HUD')}</h1>
        <p>{t('Drag each part of the HUD; pull the yellow corner to resize. Nothing can stay over the room.')}</p>
        <div className="hud-editor-row" role="group" aria-label={t('Room')}>
          <Button variant={room === 'left' ? 'primary' : 'secondary'} onClick={() => changeRoom('left')} aria-pressed={room === 'left'}>
            {t('Room on the left')}
          </Button>
          <Button variant={room === 'centre' ? 'primary' : 'secondary'} onClick={() => changeRoom('centre')} aria-pressed={room === 'centre'}>
            {t('Room in the centre')}
          </Button>
        </div>
        <div className="hud-editor-toggles">
          {HUD_COMPONENTS.map((id) => (
            <label key={id}>
              <input type="checkbox" checked={!hidden.has(id)} onChange={() => toggle(id)} />
              {t(LABELS[id])}
            </label>
          ))}
        </div>
        <div className="hud-editor-row">
          <Button variant="ghost" onClick={restore}>
            {t('Restore defaults')}
          </Button>
          <span className="hud-editor-spacer" />
          <Button onClick={cancel}>{t('Cancel')}</Button>
          <Button variant="primary" onClick={save}>
            {t('Save')}
          </Button>
        </div>
      </section>
    </div>
  );
}
