"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { VisionCostSessionSnapshot } from "@/lib/visionCost/types";

type ApiPayload = VisionCostSessionSnapshot & { logTail: string };

function usd(n: number) {
  return `$${n.toFixed(4)}`;
}

type VisionCostDashboardProps = {
  variant?: "default" | "v2";
};

export function VisionCostDashboard({
  variant = "default",
}: VisionCostDashboardProps) {
  const isV2 = variant === "v2";
  const [data, setData] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/vision-costs", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Could not load costs (${response.status})`);
      }
      const json = (await response.json()) as ApiPayload;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (error && !data) {
    return (
      <p
        className={cn(
          "text-lg text-red-700",
          isV2 ? "mt-4" : "mt-8 font-body",
        )}
        role="alert"
      >
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <p
        className={cn(
          isV2 ? "mt-4 text-v2-muted" : "mt-8 font-body text-lg text-ink-soft",
        )}
      >
        Loading session…
      </p>
    );
  }

  const sectionClass = isV2
    ? "v2-panel p-5 sm:p-6"
    : "rounded-2xl border border-ink/10 bg-white/70 p-6 shadow-sm";
  const headingClass = isV2
    ? "text-lg font-semibold text-slate-900 sm:text-xl"
    : "font-display text-2xl font-bold";
  const labelClass = isV2 ? "text-v2-muted" : "text-ink-soft";
  const bodyClass = isV2 ? "text-sm sm:text-base" : "font-body text-base";
  const statClass = isV2
    ? "text-2xl font-bold text-slate-900"
    : "text-2xl font-display";
  const rateItemClass = isV2
    ? "rounded-lg border border-slate-200/80 bg-v2-bg-subtle px-4 py-3"
    : "rounded-xl border border-ink/5 bg-cream/80 px-4 py-3";

  return (
    <div className={cn("space-y-6 sm:space-y-8", !isV2 && "mt-8 space-y-10")}>
      <section className={sectionClass}>
        <h2 className={headingClass}>This server session</h2>
        <dl className={cn("mt-4 grid gap-3 sm:grid-cols-2", bodyClass)}>
          <div>
            <dt className={labelClass}>Session ID</dt>
            <dd className="font-mono text-sm">{data.sessionId}</dd>
          </div>
          <div>
            <dt className={labelClass}>Started</dt>
            <dd>{new Date(data.startedAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className={labelClass}>Rates checked</dt>
            <dd>
              {data.ratesFetchedAt
                ? new Date(data.ratesFetchedAt).toLocaleString()
                : "Pending"}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Rates source</dt>
            <dd className="break-all">{data.ratesSource ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className={labelClass}>Log file</dt>
            <dd className="font-mono text-sm">{data.logFilePath}</dd>
          </div>
        </dl>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>Rates (USD / 1M tokens)</h2>
        <ul className={cn("mt-4 space-y-3", bodyClass)}>
          {data.modelRates.map((rate) => (
            <li key={rate.modelId} className={rateItemClass}>
              <p className="font-mono text-sm font-semibold">{rate.modelId}</p>
              <p className={cn("mt-1", labelClass)}>
                Input {usd(rate.inputUsdPerMTok)} · Text output{" "}
                {usd(rate.outputTextUsdPerMTok)}
                {rate.outputImageUsdPerMTok != null
                  ? ` · Image output ${usd(rate.outputImageUsdPerMTok)}`
                  : null}{" "}
                ·{" "}
                <span className={isV2 ? "text-slate-700" : "text-ink"}>
                  {rate.source}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>Session totals</h2>
        <dl className={cn("mt-4 grid gap-3 sm:grid-cols-3", bodyClass)}>
          <div>
            <dt className={labelClass}>API calls</dt>
            <dd className={statClass}>{data.totals.callCount}</dd>
          </div>
          <div>
            <dt className={labelClass}>Input tokens</dt>
            <dd className={statClass}>
              {data.totals.inputTokens.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Output tokens</dt>
            <dd className={statClass}>
              {data.totals.outputTokens.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Input cost</dt>
            <dd>{usd(data.totals.inputCostUsd)}</dd>
          </div>
          <div>
            <dt className={labelClass}>Output cost</dt>
            <dd>{usd(data.totals.outputCostUsd)}</dd>
          </div>
          <div>
            <dt className={labelClass}>Total cost</dt>
            <dd className={cn(statClass, isV2 ? "text-v2-success-text" : "text-like")}>
              {usd(data.totals.totalCostUsd)}
            </dd>
          </div>
        </dl>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>Interactions</h2>
        {data.events.length === 0 ? (
          <p className={cn("mt-4", labelClass)}>
            No vision API calls yet this session. Generate a photo coloring sheet
            to see entries here.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className={cn("min-w-full border-collapse text-sm", bodyClass)}>
              <thead>
                <tr className={cn("border-b text-left", isV2 ? "border-slate-200 text-v2-muted" : "border-ink/10 text-ink-soft")}>
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Operation</th>
                  <th className="py-2 pr-4">Model</th>
                  <th className="py-2 pr-4">In</th>
                  <th className="py-2 pr-4">Out</th>
                  <th className="py-2 pr-4">Cost</th>
                </tr>
              </thead>
              <tbody>
                {[...data.events].reverse().map((event) => (
                  <tr
                    key={event.id}
                    className={isV2 ? "border-b border-slate-100" : "border-b border-ink/5"}
                  >
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {new Date(event.at).toLocaleTimeString()}
                    </td>
                    <td className="py-2 pr-4">{event.operation}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {event.modelId}
                    </td>
                    <td className="py-2 pr-4">{event.inputTokens}</td>
                    <td className="py-2 pr-4">{event.outputTokens}</td>
                    <td className="py-2 pr-4">{usd(event.totalCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className={
          isV2
            ? "rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm"
            : "rounded-2xl border border-ink/10 bg-ink p-4 shadow-sm"
        }
      >
        <h2
          className={
            isV2
              ? "text-lg font-semibold text-slate-100"
              : "font-display text-xl font-bold text-cream"
          }
        >
          Log tail
        </h2>
        <pre className="mt-3 max-h-96 overflow-auto font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
          {data.logTail || "(empty)"}
        </pre>
      </section>

      {error ? (
        <p className="text-sm text-red-700" role="status">
          Refresh issue: {error}
        </p>
      ) : null}
    </div>
  );
}
