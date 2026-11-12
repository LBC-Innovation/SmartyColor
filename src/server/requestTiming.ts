import { configuredImageVendor } from "@/lib/ai/image";

/**
 * Times the stages of a slow request and logs one JSON line when it ends, e.g.
 * {"level":"info","message":"Request timing","route":"photo-coloring",
 *  "stagesMs":{"loadPhoto":420,"quote":180,"model":16900,"charge":210,"store":640},"totalMs":18350}
 * Each mark records the time since the previous mark.
 */
export type RequestTimer = {
  mark(stage: string): void;
  done(extra?: Record<string, unknown>): void;
};

export function startRequestTimer(route: string, context: Record<string, unknown> = {}): RequestTimer {
  const started = performance.now();
  let last = started;
  const stagesMs: Record<string, number> = {};
  let finished = false;

  return {
    mark(stage) {
      const now = performance.now();
      stagesMs[stage] = (stagesMs[stage] ?? 0) + Math.round(now - last);
      last = now;
    },
    done(extra = {}) {
      if (finished) return;
      finished = true;
      console.log(
        JSON.stringify({
          level: "info",
          message: "Request timing",
          route,
          imageVendor: configuredImageVendor(),
          ...context,
          ...extra,
          stagesMs,
          totalMs: Math.round(performance.now() - started),
        }),
      );
    },
  };
}
