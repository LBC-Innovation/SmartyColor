"use client";

import { useMemo, useState } from "react";
import { formatCredits } from "@/lib/credits/money";
import type { SeriesPoint } from "@/lib/finance/types";

// Categorical slots 1 and 2 of the validated reference palette (adjacent pair passes CVD checks);
// net is drawn in ink so it reads as the result of the two, not a third category.
const CASH_IN = "#2a78d6";
const CASH_OUT = "#eb6834";
const NET = "#303a4d";
const GRID = "#e5e7eb";

const W = 720;
const H = 260;
const PAD = { top: 12, right: 12, bottom: 28, left: 56 };

/** Round the axis to a clean step (1, 2, 2.5, 5 × 10ⁿ). */
function niceStep(range: number, ticks: number): number {
  const raw = range / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function axisLabel(cents: number): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  const text =
    abs >= 1000
      ? `$${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1)}K`
      : `$${Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(2)}`;
  return dollars < 0 ? `-${text}` : text;
}

/** Cash in above the baseline, cash out below it, net cash flow as a line across both. */
export function V2FinanceCashChart({ series }: { series: SeriesPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const max = Math.max(1, ...series.map((p) => Math.max(p.cashInCents, p.netCashFlowCents)));
    const min = Math.min(-1, ...series.map((p) => Math.min(-p.cashOutCents, p.netCashFlowCents)));
    const step = niceStep(max - min, 4);
    const top = Math.ceil(max / step) * step;
    const bottom = Math.floor(min / step) * step;
    const ticks: number[] = [];
    for (let v = bottom; v <= top + step / 2; v += step) ticks.push(Math.round(v));
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const y = (v: number) => PAD.top + ((top - v) / (top - bottom)) * plotH;
    const band = plotW / Math.max(series.length, 1);
    const barW = Math.max(2, Math.min(24, band * 0.6));
    const x = (i: number) => PAD.left + band * i + band / 2;
    return { ticks, y, band, barW, x };
  }, [series]);

  if (series.length === 0) return null;
  const { ticks, y, band, barW, x } = geo;
  const zero = y(0);
  // Label every bucket when they fit, otherwise about eight evenly.
  const labelEvery = Math.max(1, Math.ceil(series.length / 8));
  const linePath = series.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.netCashFlowCents)}`).join(" ");
  const active = hover == null ? null : series[hover];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-v2-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CASH_IN }} /> Cash in
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CASH_OUT }} /> Cash out
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: NET }} /> Net cash flow
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label="Cash in and cash out by period, with net cash flow"
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#9ca3af" : GRID} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-v2-muted text-[11px] tabular-nums">
                {axisLabel(t)}
              </text>
            </g>
          ))}

          {hover != null ? (
            <rect x={x(hover) - band / 2} y={PAD.top} width={band} height={H - PAD.top - PAD.bottom} fill="#7446f0" opacity={0.06} />
          ) : null}

          {series.map((p, i) => {
            const inH = zero - y(p.cashInCents);
            const outH = y(-p.cashOutCents) - zero;
            // 4px rounded data-end, square at the baseline, 1px gap off the zero line.
            const rIn = Math.min(4, barW / 2, Math.max(0, inH - 1));
            const rOut = Math.min(4, barW / 2, Math.max(0, outH - 1));
            return (
              <g key={p.start}>
                {inH > 1.5 ? (
                  <path
                    d={`M${x(i) - barW / 2},${zero - 1} v${-(inH - 1 - rIn)} q0,${-rIn} ${rIn},${-rIn} h${barW - 2 * rIn} q${rIn},0 ${rIn},${rIn} v${inH - 1 - rIn} z`}
                    fill={CASH_IN}
                  />
                ) : null}
                {outH > 1.5 ? (
                  <path
                    d={`M${x(i) - barW / 2},${zero + 1} v${outH - 1 - rOut} q0,${rOut} ${rOut},${rOut} h${barW - 2 * rOut} q${rOut},0 ${rOut},${-rOut} v${-(outH - 1 - rOut)} z`}
                    fill={CASH_OUT}
                  />
                ) : null}
                {i % labelEvery === 0 ? (
                  <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-v2-muted text-[11px]">
                    {p.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          <path d={linePath} fill="none" stroke={NET} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {series.length <= 60
            ? series.map((p, i) => (
                <circle key={p.start} cx={x(i)} cy={y(p.netCashFlowCents)} r={hover === i ? 5 : 3.5} fill={NET} stroke="#fff" strokeWidth={2} />
              ))
            : null}

          {/* Hit targets: the whole band, wider than the marks. */}
          {series.map((p, i) => (
            <rect
              key={p.start}
              x={x(i) - band / 2}
              y={PAD.top}
              width={band}
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${p.label}: cash in ${formatCredits(p.cashInCents)}, cash out ${formatCredits(p.cashOutCents)}, net ${formatCredits(p.netCashFlowCents)}`}
            />
          ))}
        </svg>

        {active && hover != null ? (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={
              x(hover) / W > 0.6
                ? { right: `${100 - ((x(hover) - band / 2) / W) * 100}%` }
                : { left: `${((x(hover) + band / 2) / W) * 100}%` }
            }
          >
            <p className="mb-1 font-semibold text-v2-ink">{active.label}</p>
            <TooltipRow color={CASH_IN} label="Cash in" cents={active.cashInCents} />
            <TooltipRow color={CASH_OUT} label="Cash out" cents={active.cashOutCents} />
            <TooltipRow color={NET} label="Net cash" cents={active.netCashFlowCents} bold />
            <div className="mt-1 border-t border-gray-100 pt-1">
              <TooltipRow label="Net revenue" cents={active.netRevenueCents} />
              <TooltipRow label="Operating profit" cents={active.operatingProfitCents} />
            </div>
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
                <th className="py-1 pr-3 text-right font-semibold">Cash in</th>
                <th className="py-1 pr-3 text-right font-semibold">Cash out</th>
                <th className="py-1 pr-3 text-right font-semibold">Net cash</th>
                <th className="py-1 pr-3 text-right font-semibold">Net revenue</th>
                <th className="py-1 text-right font-semibold">Operating profit</th>
              </tr>
            </thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.start} className="border-t border-gray-100 text-v2-ink">
                  <td className="py-1 pr-3">{p.label}</td>
                  <td className="py-1 pr-3 text-right">{formatCredits(p.cashInCents)}</td>
                  <td className="py-1 pr-3 text-right">{formatCredits(p.cashOutCents)}</td>
                  <td className="py-1 pr-3 text-right">{formatCredits(p.netCashFlowCents)}</td>
                  <td className="py-1 pr-3 text-right">{formatCredits(p.netRevenueCents)}</td>
                  <td className="py-1 text-right">{formatCredits(p.operatingProfitCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function TooltipRow({ color, label, cents, bold }: { color?: string; label: string; cents: number; bold?: boolean }) {
  return (
    <p className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5 text-v2-muted">
        {color ? <span className="h-2 w-2 rounded-sm" style={{ background: color }} /> : <span className="w-2" />}
        {label}
      </span>
      <span className={bold ? "font-semibold tabular-nums text-v2-ink" : "tabular-nums text-v2-ink"}>{formatCredits(cents)}</span>
    </p>
  );
}
