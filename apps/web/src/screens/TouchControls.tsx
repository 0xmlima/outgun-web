// SPDX-License-Identifier: GPL-2.0-or-later
// Controles de toque do celular (experimental): à esquerda o direcional, com andar sozinho e Shift fixo
// embaixo; à direita o tiro, com Alt fixo e tiro automático embaixo. Viram os mesmos bits de `CONTROL` do teclado (`setTouch`).
import { CONTROL } from '@outgun/sim';
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { usePrefs } from '../app/prefs.js';
import type { GameHost } from '../game/host.js';
import { ACTION_LABELS } from '../game/input/bindings.js';

/** Fração do raio do direcional em que o toque ainda não aponta direção. */
const DEAD_ZONE = 0.25;

/** Direção (bits de `CONTROL`) em 8 setores de 45° a partir do deslocamento do dedo. */
function stickBits(dx: number, dy: number, radius: number): number {
  if (Math.hypot(dx, dy) < DEAD_ZONE * radius) return 0;
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)); // -4..4, 0 = direita, 2 = baixo
  const bits = [CONTROL.left, CONTROL.left | CONTROL.up, CONTROL.up, CONTROL.up | CONTROL.right, CONTROL.right, CONTROL.right | CONTROL.down, CONTROL.down, CONTROL.down | CONTROL.left, CONTROL.left];
  return bits[sector + 4]!;
}

export function TouchControls({ host }: { readonly host: RefObject<GameHost | null> }) {
  const { t } = usePrefs();
  const [auto, setAuto] = useState(false);
  const [run, setRun] = useState(false);
  const [strafe, setStrafe] = useState(false);
  const [fire, setFire] = useState(false);
  /** Tiro automático: atira sem segurar o botão. */
  const [autoFire, setAutoFire] = useState(false);
  /** Direção do dedo agora (0 sem toque) e a última apontada (para o modo automático). */
  const [touchDir, setTouchDir] = useState(0);
  const lastDir = useRef(0);
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const stick = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);

  const dir = touchDir || (auto ? lastDir.current : 0);
  const controls = dir | (run ? CONTROL.run : 0) | (strafe ? CONTROL.strafe : 0);
  useEffect(() => {
    host.current?.setTouch(controls, fire || autoFire);
  }, [host, controls, fire, autoFire]);
  useEffect(() => () => host.current?.setTouch(0, false), [host]);

  const moveStick = (ev: PointerEvent<HTMLDivElement>) => {
    const r = stick.current!.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = ev.clientX - (r.left + radius);
    let dy = ev.clientY - (r.top + radius);
    const d = Math.hypot(dx, dy);
    if (d > radius) {
      dx = (dx * radius) / d;
      dy = (dy * radius) / d;
    }
    setKnob({ x: dx, y: dy });
    const bits = stickBits(dx, dy, radius);
    if (bits) lastDir.current = bits;
    setTouchDir(bits);
  };
  const releaseStick = (ev: PointerEvent<HTMLDivElement>) => {
    if (ev.pointerId !== stickPointer.current) return;
    stickPointer.current = null;
    setKnob(null);
    setTouchDir(0);
  };

  const holdFire = (on: boolean) => (ev: PointerEvent<HTMLButtonElement>) => {
    if (on) ev.currentTarget.setPointerCapture(ev.pointerId);
    setFire(on);
  };

  /** Liga e desliga no toque (`pointerdown`, não `click`): funciona com outro dedo segurando o direcional. */
  const toggle = (set: (fn: (on: boolean) => boolean) => void) => (ev: PointerEvent<HTMLButtonElement>) => {
    ev.preventDefault();
    set((on) => !on);
  };

  return (
    <div className="touch-controls" onContextMenu={(ev) => ev.preventDefault()}>
      <div className="touch-side">
        <div
          ref={stick}
          className="touch-stick"
          onPointerDown={(ev) => {
            // um toque novo sempre assume o direcional: se o fim do anterior se perdeu (a tela do fim
            // da partida abriu por cima, por exemplo), ele não fica preso numa direção
            stickPointer.current = ev.pointerId;
            ev.currentTarget.setPointerCapture(ev.pointerId);
            moveStick(ev);
          }}
          onPointerMove={(ev) => ev.pointerId === stickPointer.current && moveStick(ev)}
          onPointerUp={releaseStick}
          onPointerCancel={releaseStick}
          onLostPointerCapture={releaseStick}
        >
          <div className="touch-knob" style={knob ? { transform: `translate(${knob.x}px, ${knob.y}px)` } : undefined} />
        </div>
        <div className="touch-row">
          <button type="button" className="touch-toggle" aria-pressed={auto} aria-label={t('Auto move')} onPointerDown={toggle(setAuto)}>
            AUTO
          </button>
          <button type="button" className="touch-toggle" aria-pressed={run} aria-label={t(ACTION_LABELS.run)} onPointerDown={toggle(setRun)}>
            SHIFT
          </button>
        </div>
      </div>
      <div className="touch-side">
        <button type="button" className="touch-fire" aria-pressed={fire || autoFire} onPointerDown={holdFire(true)} onPointerUp={holdFire(false)} onPointerCancel={holdFire(false)}>
          {t(ACTION_LABELS.fire)}
        </button>
        <div className="touch-row">
          <button type="button" className="touch-toggle" aria-pressed={strafe} aria-label={t(ACTION_LABELS.strafe)} onPointerDown={toggle(setStrafe)}>
            ALT
          </button>
          <button type="button" className="touch-toggle" aria-pressed={autoFire} aria-label={t('Auto fire')} onPointerDown={toggle(setAutoFire)}>
            AUTO
          </button>
        </div>
      </div>
    </div>
  );
}
