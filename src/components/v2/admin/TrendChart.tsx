"use client";

import { useMemo, useState } from "react";

export const CHART_COLORS = { primary: "#2a78d6", cost: "#eb6834", net: "#303a4d", grid: "#e5e7eb" } as const;

export type TrendSeries = {
  label: string;
  values: number[];
  color: string;
  /** "bar" grows up from zero; "barDown" draws the value below zero (costs); "line" connects points. */
  kind: "bar" | "barDown" | "line";
};

const W = 720;
const PAD = { top: 12, right: 12, bottom: 28, left: 60 };

function niceStep(range: number, ticks: number): number {
  const raw = range / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/**
 * Up to three series over shared buckets: bars up, bars down, and a line. Hovering or focusing a bucket
 * shows every series' value; a "Show as table" disclosure carries the same numbers for anyone who
 * prefers (or needs) them.
 */
export function TrendChart({
  series,
  labels,
  format,
  axisFormat,
  height = 200,
  ariaLabel,
}: {
  series: TrendSeries[];
  /** One label per bucket, e.g. "Nov 3". */
  labels: string[];
  /** Tooltip and table values. */
  format: (value: number) => string;
  /** Y axis ticks; defaults to `format`. */
  axisFormat?: (value: number) => string;
  height?: number;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const H = height;
  const n = labels.length;

  const geo = useMemo(() => {
    const signed = (s: TrendSeries, v: number) => (s.kind === "barDown" ? -Math.abs(v) : v);
    const all = series.flatMap((s) => s.values.map((v) => signed(s, v)));
    const max = Math.max(0, ...all);
    const min = Math.min(0, ...all);
    const range = max - min || 1;
    const step = niceStep(range, 4);
    const top = Math.max(step, Math.ceil(max / step) * step);
    const bottom = Math.floor(min / step) * step;
    const ticks: number[] = [];
    for (let v = bottom; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const y = (v: number) => PAD.top + ((top - v) / (top - bottom || 1)) * plotH;
    const band = plotW / Math.max(n, 1);
    const bars = series.filter((s) => s.kind !== "line");
    const upBars = bars.filter((s) => s.kind === "bar");
    const barW = Math.max(2, Math.min(22, (band * 0.7) / Math.max(1, upBars.length)));
    const x = (i: number) => PAD.left + band * i + band / 2;
    return { ticks, y, band, barW, x, signed, upBars };
  }, [series, n, H]);

  if (n === 0) return null;
  const { ticks, y, band, barW, x, signed, upBars } = geo;
  const zero = y(0);
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const axis = axisFormat ?? format;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-v2-muted" aria-hidden>
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            {s.kind === "line" ? (
              <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />
            ) : (
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            )}
            {s.label}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#9ca3af" : CHART_COLORS.grid} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-v2-muted text-[11px] tabular-nums">
                {axis(t)}
              </text>
            </g>
          ))}
          {hover != null ? (
            <rect x={x(hover) - band / 2} y={PAD.top} width={band} height={H - PAD.top - PAD.bottom} fill="#7446f0" opacity={0.06} />
          ) : null}
          {labels.map((label, i) => (
            <g key={i}>
              {series.map((s) => {
                if (s.kind === "line") return null;
                const v = signed(s, s.values[i] ?? 0);
                const h = Math.abs(zero - y(v));
                if (h < 1) return null;
                const slot = s.kind === "bar" ? upBars.indexOf(s) : 0;
                const offset = s.kind === "bar" ? (slot - (upBars.length - 1) / 2) * barW : 0;
                const left = x(i) + offset - barW / 2;
                return (
                  <rect
                    key={s.label}
                    x={left}
                    y={v >= 0 ? zero - h : zero}
                    width={Math.max(1, barW - (upBars.length > 1 ? 1 : 0))}
                    height={h}
                    rx={Math.min(3, barW / 2)}
                    fill={s.color}
                  />
                );
              })}
              {i % labelEvery === 0 ? (
                <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-v2-muted text-[11px]">
                  {label}
                </text>
              ) : null}
            </g>
          ))}
          {series
            .filter((s) => s.kind === "line")
            .map((s) => (
              <g key={s.label}>
                <path
                  d={s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {n <= 40 ? s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : 3} fill={s.color} stroke="#fff" strokeWidth={1.5} />) : null}
              </g>
            ))}
          {labels.map((label, i) => (
            <rect
              key={`hit-${i}`}
              x={x(i) - band / 2}
              y={PAD.top}
              width={band}
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
              tabIndex={0}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${label}: ${series.map((s) => `${s.label} ${format(s.values[i] ?? 0)}`).join(", ")}`}
            />
          ))}
        </svg>
        {hover != null ? (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={x(hover) / W > 0.6 ? { right: `${100 - ((x(hover) - band / 2) / W) * 100}%` } : { left: `${((x(hover) + band / 2) / W) * 100}%` }}
          >
            <p className="mb-1 font-semibold text-v2-ink">{labels[hover]}</p>
            {series.map((s) => (
              <p key={s.label} className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-1.5 text-v2-muted">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="tabular-nums text-v2-ink">{format(s.values[hover] ?? 0)}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <details className="mt-2 text-xs text-v2-muted">
        <summary className="cursor-pointer font-semibold text-v2-link">Show as table</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th className="py-1 pr-3 font-semibold">Period</th>
                {series.map((s) => (
                  <th key={s.label} className="py-1 pr-3 text-right font-semibold">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label, i) => (
                <tr key={i} className="border-t border-gray-100 text-v2-ink">
                  <td className="py-1 pr-3">{label}</td>
                  {series.map((s) => (
                    <td key={s.label} className="py-1 pr-3 text-right">
                      {format(s.values[i] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
