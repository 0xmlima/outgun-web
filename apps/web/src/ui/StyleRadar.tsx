// SPDX-License-Identifier: GPL-2.0-or-later
// Radar de estilo (OG-470, RN-RAD-01/03): SVG com anéis 25/50/75/100 (o 50 tracejado), até 3 séries
// sobrepostas e uma sombra cinza por baixo (OG-476), tooltip no ponto e "Ver em tabela". A variante
// mini (membros do clã, lobby) não tem rótulos, tooltip nem tabela.
import { useState } from 'react';
import { usePrefs } from '../app/prefs.js';
import { Button } from './Button.js';
import { AXIS_LABELS, axisAngle, axisValueText, radarPoint, radarPolygon, STYLE_AXES, type StyleAxisValue } from './style-radar.js';
import { Table } from './Table.js';

export interface RadarSeries {
  readonly key: string;
  readonly label: string;
  readonly axes: readonly StyleAxisValue[];
  /** Cor CSS (de preferência um token); padrão: azul, vermelho e destaque, nessa ordem. */
  readonly color?: string;
  /** Contorno tracejado: temporada anterior ou "poucos jogos" (RN-RAD-03). */
  readonly dashed?: boolean;
}

const DEFAULT_COLORS = ['var(--text-team-blue)', 'var(--text-team-red)', 'var(--accent)'];
const RINGS = [25, 50, 75, 100];

interface StyleRadarProps {
  readonly caption: string;
  /** Até 3 séries; as que passarem disso não aparecem. */
  readonly series: readonly RadarSeries[];
  /** Referência cinza por baixo das séries (média do clã, top 10 do mês). */
  readonly shadow?: RadarSeries;
  readonly mini?: boolean;
  /** Texto no centro quando não há série. */
  readonly empty?: string;
}

export function StyleRadar({ caption, series: all, shadow, mini = false, empty }: StyleRadarProps) {
  const { t, prefs } = usePrefs();
  const label = (a: (typeof STYLE_AXES)[number]) => t(AXIS_LABELS[a]);
  const valueText = (a: (typeof STYLE_AXES)[number], v: number) => axisValueText(a, v, prefs.locale);
  empty ??= t('No data');
  const series = all.slice(0, 3);
  const [active, setActive] = useState<{ s: number; i: number } | null>(null);
  const [table, setTable] = useState(false);
  const vb = mini ? 100 : 340;
  const c = vb / 2;
  const r = mini ? 46 : 110;
  // margem dos lados para os rótulos ("Sobrevivência") caberem até a 360 px
  const pad = mini ? 0 : 50;
  const color = (s: RadarSeries, n: number) => s.color ?? DEFAULT_COLORS[n % DEFAULT_COLORS.length]!;
  const summary = series.map((s) => `${s.label}: ${s.axes.map((a) => `${label(a.axis)} ${a.percentile}`).join(', ')}`).join('; ');
  const tip = active && series[active.s] ? { s: series[active.s]!, axis: STYLE_AXES[active.i]!, n: active.s } : null;
  const tipValue = tip && tip.s.axes.find((a) => a.axis === tip.axis);
  const tipPoint = tip && tipValue ? radarPoint(active!.i, tipValue.percentile, r, c, c) : null;

  if (table && !mini)
    return (
      <div className="ui-radar ui-stack">
        <Table
          caption={caption}
          rows={STYLE_AXES}
          rowKey={(a) => a}
          columns={[
            { key: 'axis', header: t('Axis'), cell: (a) => label(a) },
            ...series.map((s) => ({
              key: s.key,
              header: s.label,
              align: 'end' as const,
              cell: (a: (typeof STYLE_AXES)[number]) => {
                const v = s.axes.find((x) => x.axis === a);
                return v ? `${v.percentile} · ${valueText(a, v.value)}` : '—';
              },
            })),
          ]}
        />
        <Button variant="ghost" onClick={() => setTable(false)}>
          {t('See radar')}
        </Button>
      </div>
    );

  return (
    <div className={mini ? 'ui-radar mini' : 'ui-radar ui-stack'}>
      <div className="ui-radar-chart">
        <svg viewBox={`${-pad} 0 ${vb + 2 * pad} ${vb}`} role="img" aria-label={series.length ? `${caption}. ${summary}` : `${caption}. ${empty}`}>
          {RINGS.map((v) => (
            <polygon
              key={v}
              className={v === 50 ? 'ui-radar-ring half' : 'ui-radar-ring'}
              points={radarPolygon(
                STYLE_AXES.map((axis) => ({ axis, percentile: v, value: 0 })),
                r,
                c,
                c,
              )}
            />
          ))}
          {STYLE_AXES.map((axis, i) => {
            const end = radarPoint(i, 100, r, c, c);
            return <line key={axis} className="ui-radar-spoke" x1={c} y1={c} x2={end.x} y2={end.y} />;
          })}
          {!mini &&
            STYLE_AXES.map((axis, i) => {
              const a = (axisAngle(i) * Math.PI) / 180;
              const x = c + (r + 16) * Math.cos(a);
              const y = c + (r + 16) * Math.sin(a);
              const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
              return (
                <text key={axis} className="ui-radar-label" x={x} y={y} textAnchor={anchor} dominantBaseline="middle">
                  {label(axis)}
                </text>
              );
            })}
          {shadow && <polygon className="ui-radar-shadow" points={radarPolygon(shadow.axes, r, c, c)} />}
          {series.map((s, n) => (
            <g key={s.key} style={{ color: color(s, n) }}>
              <polygon className={s.dashed ? 'ui-radar-area dashed' : 'ui-radar-area'} points={radarPolygon(s.axes, r, c, c)} />
              {!mini &&
                STYLE_AXES.map((axis, i) => {
                  const v = s.axes.find((a) => a.axis === axis);
                  if (!v) return null;
                  const p = radarPoint(i, v.percentile, r, c, c);
                  const on = () => setActive({ s: n, i });
                  const off = () => setActive(null);
                  return (
                    <circle
                      key={axis}
                      className="ui-radar-dot"
                      cx={p.x}
                      cy={p.y}
                      r={5}
                      tabIndex={0}
                      aria-label={`${s.label}, ${label(axis)}: ${t('Percentile $1', String(v.percentile))}, ${valueText(axis, v.value)}`}
                      onMouseEnter={on}
                      onFocus={on}
                      onMouseLeave={off}
                      onBlur={off}
                      onClick={on}
                    />
                  );
                })}
            </g>
          ))}
          {series.length === 0 && (
            <text className="ui-radar-empty" x={c} y={c} textAnchor="middle" dominantBaseline="middle">
              {empty}
            </text>
          )}
        </svg>
        {tip && tipValue && tipPoint && (
          <div className="ui-radar-tip" role="status" style={{ left: `${((tipPoint.x + pad) / (vb + 2 * pad)) * 100}%`, top: `${(tipPoint.y / vb) * 100}%`, borderColor: color(tip.s, tip.n) }}>
            <strong>{label(tip.axis)}</strong>
            {series.length > 1 && <span className="ui-muted">{tip.s.label}</span>}
            <span>{t('Percentile $1', String(tipValue.percentile))}</span>
            <span className="ui-muted">{valueText(tip.axis, tipValue.value)}</span>
          </div>
        )}
      </div>
      {!mini && series.length > 0 && (
        <div className="ui-row ui-radar-legend">
          {series.length > 1 &&
            series.map((s, n) => (
              <span key={s.key} className="ui-radar-key" style={{ color: color(s, n) }}>
                <i className={s.dashed ? 'dashed' : undefined} aria-hidden /> <span>{s.label}</span>
              </span>
            ))}
          {shadow && (
            <span className="ui-radar-key shadow">
              <i aria-hidden /> <span>{shadow.label}</span>
            </span>
          )}
          <Button variant="ghost" onClick={() => setTable(true)}>
            {t('See as table')}
          </Button>
        </div>
      )}
    </div>
  );
}
