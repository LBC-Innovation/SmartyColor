/**
 * Is the image service working right now? One rule shared by the AI usage banner, the sidebar dot and
 * Overview's "Needs attention", so the three never disagree.
 *
 * A billing, sign-in or quota error is an open problem until a successful call is recorded after it
 * (that proves the fix worked), or until it is more than a day old. Errors are never removed: they stay
 * in the failure history with the time they were resolved.
 */

export const SERVICE_PROBLEM_KINDS = ["billing", "auth", "quota"] as const;
export type ServiceProblemKind = (typeof SERVICE_PROBLEM_KINDS)[number];

type ErrorLike = { at: string; kind: string };
type CallLike = { at: string };

const WINDOW_MS = 86_400_000;

export function isServiceProblem(kind: string): kind is ServiceProblemKind {
  return (SERVICE_PROBLEM_KINDS as readonly string[]).includes(kind);
}

/** The first successful call after `at`, or null when none has happened yet. */
export function resolvedAt(errorAt: string, calls: CallLike[]): string | null {
  const t = new Date(errorAt).getTime();
  let first: number | null = null;
  for (const c of calls) {
    const ct = new Date(c.at).getTime();
    if (ct > t && (first == null || ct < first)) first = ct;
  }
  return first == null ? null : new Date(first).toISOString();
}

export type AiHealth<E extends ErrorLike> = {
  /** Newest billing or sign-in error with no successful call since. */
  blocking: E | null;
  /** Newest quota error with no successful call since. */
  quota: E | null;
  /** Service problems in the last day that a later successful call cleared, newest first. */
  resolved: Array<{ error: E; resolvedAt: string }>;
  /** Every failed call in the last day, of any kind. */
  recentCount: number;
};

export function aiHealth<E extends ErrorLike>(errors: E[], calls: CallLike[], now: number): AiHealth<E> {
  const since = now - WINDOW_MS;
  const recent = errors
    .filter((e) => new Date(e.at).getTime() >= since)
    .sort((a, b) => b.at.localeCompare(a.at));
  let latestCall = -Infinity;
  for (const c of calls) latestCall = Math.max(latestCall, new Date(c.at).getTime());
  const open = (e: E) => latestCall <= new Date(e.at).getTime();

  const problems = recent.filter((e) => isServiceProblem(e.kind));
  const blocking = problems.find((e) => (e.kind === "billing" || e.kind === "auth") && open(e)) ?? null;
  const quota = problems.find((e) => e.kind === "quota" && open(e)) ?? null;
  const resolved: AiHealth<E>["resolved"] = [];
  for (const e of problems) {
    if (open(e)) continue;
    const at = resolvedAt(e.at, calls);
    if (at) resolved.push({ error: e, resolvedAt: at });
  }
  return { blocking, quota, resolved, recentCount: recent.length };
}
