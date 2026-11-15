import { useState } from "react";
import { createPortal } from "react-dom";
import { WEEKDAYS, heatLevel, hourLabel, niceMax } from "../utils/report.js";

/**
 * BIAFYT GYM WEB — GRÁFICOS (HTML/CSS, sin dependencias)
 *
 * Reglas (guía dataviz): una sola serie por gráfico → sin leyenda; columnas
 * finas (≤24px) con extremo redondeado y 2px de aire entre ellas; magnitud
 * con UN solo tono (el primario del tema), énfasis = resaltar y atenuar el
 * resto; etiquetas solo en el extremo; cada marca es su propio objetivo de
 * hover/foco con tooltip (valor primero, nombre después). El texto usa
 * tokens de texto, nunca el color de la serie. Los nombres/valores llegan
 * como texto de React (nunca innerHTML).
 */

/** Tooltip por marca: `bind(value, label)` devuelve los handlers de hover/foco. */
function useTip() {
  const [tip, setTip] = useState(null);
  const show = (value, label) => (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ value, label, x: r.left + r.width / 2, y: r.top });
  };
  const hide = () => setTip(null);
  const bind = (value, label) => ({
    tabIndex: 0,
    onPointerEnter: show(value, label),
    onFocus: show(value, label),
    onPointerLeave: hide,
    onBlur: hide,
  });
  // Portal a <body>: las tarjetas usan backdrop-filter, que vuelve `fixed`
  // relativo a la tarjeta en vez de a la ventana.
  const node =
    tip &&
    createPortal(
      <div className="chart-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
        <strong>{tip.value}</strong>
        <span>{tip.label}</span>
      </div>,
      document.body
    );
  return { bind, node };
}

/**
 * Columnas de una serie.
 * @param {{ key: string|number, label: string, axis?: string, value: number, unit?: string, emphasis?: boolean }[]} data
 *   `axis` = texto bajo la columna (solo se pinta cada `every`); `emphasis` resalta la columna.
 */
export function Columns({ data, ariaLabel, every = 1, height = 168 }) {
  const { bind, node } = useTip();
  const max = Math.max(0, ...data.map((d) => d.value));
  const top = niceMax(max);
  const ticks = [0, top / 2, top];
  const peakIndex = max > 0 ? data.findIndex((d) => d.value === max) : -1;

  return (
    <div className="chart" role="group" aria-label={ariaLabel}>
      <div className="chart-plot" style={{ height }}>
        {ticks.map((t) => (
          <div key={t} className="chart-grid" style={{ bottom: `${(t / top) * 100}%` }}>
            <span>{t}</span>
          </div>
        ))}
        <div className="chart-cols">
          {data.map((d, i) => (
            <div key={d.key} className="chart-col" aria-label={`${d.label}: ${d.value} ${d.unit ?? "check-ins"}`} {...bind(`${d.value} ${d.unit ?? "check-ins"}`, d.label)}>
              {i === peakIndex && (
                <span className="chart-val" style={{ bottom: `${(d.value / top) * 100}%` }}>
                  {d.value}
                </span>
              )}
              <div className={`chart-bar ${d.emphasis ? "chart-bar-on" : ""}`} style={{ height: `${(d.value / top) * 100}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="chart-x" aria-hidden="true">
        {data.map((d, i) => (
          <span key={d.key}>{i % every === 0 ? d.axis ?? d.label : ""}</span>
        ))}
      </div>
      {node}
    </div>
  );
}

/**
 * Mapa de calor día × hora (magnitud: un tono, más intenso = más check-ins).
 * @param {number[][]} matrix [día (lunes = 0)][hora]
 * @param {[number, number]} range horas a mostrar [primera, última]
 */
export function Heatmap({ matrix, range, ariaLabel }) {
  const { bind, node } = useTip();
  const [lo, hi] = range;
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const max = Math.max(0, ...matrix.flat());

  return (
    <div className="heat" role="group" aria-label={ariaLabel}>
      <div className="heat-grid" style={{ gridTemplateColumns: `34px repeat(${hours.length}, minmax(0, 1fr))` }}>
        <span />
        {hours.map((h) => (
          <span key={h} className="heat-hour" aria-hidden="true">
            {h % 2 === 0 ? h : ""}
          </span>
        ))}
        {WEEKDAYS.map((day, d) => [
          <span key={`l${d}`} className="heat-day">
            {day}
          </span>,
          ...hours.map((h) => {
            const n = matrix[d][h];
            return (
              <div
                key={`${d}-${h}`}
                className={`heat-cell heat-${heatLevel(n, max)}`}
                aria-label={`${day} ${hourLabel(h)}: ${n} check-ins`}
                {...bind(`${n} check-ins`, `${day} ${hourLabel(h)}`)}
              />
            );
          }),
        ])}
      </div>
      <div className="heat-legend" aria-hidden="true">
        <span>Menos</span>
        {[0, 1, 2, 3, 4, 5].map((l) => (
          <i key={l} className={`heat-cell heat-${l}`} />
        ))}
        <span>Más</span>
      </div>
      {node}
    </div>
  );
}

/** Lista de barras horizontales ordenadas (nombre · barra · cifra), una sola serie. */
export function RankedBars({ rows }) {
  const { bind, node } = useTip();
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <div className="ranked">
      {rows.map((r) => (
        <div key={r.key} className="ranked-row" {...bind(r.tip, r.name)}>
          <span className="ranked-name">{r.name}</span>
          <span className="ranked-track">
            <span className="ranked-fill" style={{ width: `${max > 0 ? (r.value / max) * 100 : 0}%` }} />
          </span>
          <strong className="ranked-val">{r.value}</strong>
        </div>
      ))}
      {node}
    </div>
  );
}
