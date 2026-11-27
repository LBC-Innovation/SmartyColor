"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ArrowLeft, Bell, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { canOpenAdminItem, isV2NavItemActive, SIGNED_IN_HOME, v2AdminNav, type V2AdminNavItem } from "@/components/v2/nav-config";
import { AdminAlertsColumn } from "@/components/v2/admin/alerts/AdminAlertsColumn";
import { buildAdminAlerts, type AiErrorLike, type AlertSources, type AdminAlert } from "@/components/v2/admin/alerts/adminAlerts";
import { ordersNeedingAttention } from "@/components/v2/admin/orderAttention";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { authedFetch } from "@/lib/api/client";
import { cn } from "@/lib/cn";

// --- Alerts ------------------------------------------------------------------------------------

type AdminAlertsState = {
  /** Every open alert, read or not, most urgent first. */
  alerts: AdminAlert[];
  /** The open alerts this admin hasn't marked read. */
  unread: AdminAlert[];
  isRead: (key: string) => boolean;
  markRead: (keys: string[]) => void;
  markUnread: (key: string) => void;
  /** True until every source this admin can see has answered once. */
  loading: boolean;
  /** Sources that couldn't be checked. */
  errors: string[];
  /** Orders that need the owner; null until loaded or without permission. */
  ordersNeedingAttention: number | null;
  /** An open billing, quota or sign-in problem: no successful call since the error (see aiHealth). */
  aiProblem: boolean;
  /** Pages call this after a change that may clear an alert. */
  refreshAlerts: () => void;
};

const AlertsContext = createContext<AdminAlertsState>({
  alerts: [],
  unread: [],
  isRead: () => false,
  markRead: () => {},
  markUnread: () => {},
  loading: false,
  errors: [],
  ordersNeedingAttention: null,
  aiProblem: false,
  refreshAlerts: () => {},
});

export function useAdminAlerts(): AdminAlertsState {
  return useContext(AlertsContext);
}

const DAY_MS = 86_400_000;
/** Read marks are also kept in the browser, so they work before migration 0046 is applied. */
const LOCAL_READS_KEY = "cm_admin_alert_reads";

function readLocal(): string[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_READS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function writeLocal(keys: Set<string>) {
  try {
    window.localStorage.setItem(LOCAL_READS_KEY, JSON.stringify([...keys].slice(-500)));
  } catch {
    // Private mode or storage blocked: the server copy still counts.
  }
}

/** The last 30 UTC days, as the finance page's "30 days" preset works them out. */
function last30Days(): { from: string; to: string } {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(today - 29 * DAY_MS), to: iso(today) };
}

type VisionCostsJson = {
  persisted?: {
    recentErrors?: AiErrorLike[];
    recentEvents?: Array<{ at: string }>;
  };
};

function useLoadAlerts(permissions: readonly string[]): AdminAlertsState {
  const canOrders = permissions.includes("usermanage:manageorders");
  const canAi = permissions.includes("costs:viewai");
  const canPricing = permissions.includes("pricing:manage");
  const canFinance = permissions.includes("finance:view");
  const [sources, setSources] = useState<AlertSources>({
    orders: null,
    ai: null,
    pricing: null,
    finance: null,
  });
  /** The refresh each source last answered for; a source is loading until it matches `tick`. */
  const [answered, setAnswered] = useState<Partial<Record<keyof AlertSources, number>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const [tick, setTick] = useState(0);
  // Nothing renders from read marks until the alerts load, so reading the browser copy here is hydration-safe.
  const [reads, setReads] = useState<Set<string>>(() => new Set(typeof window === "undefined" ? [] : readLocal()));

  useEffect(() => {
    let alive = true;
    const jobs: Array<[keyof AlertSources, Promise<void>]> = [];
    const fail = (source: string, message: string) => {
      if (alive) setErrors((e) => ({ ...e, [source]: message }));
    };
    const ok = (source: string) => {
      if (alive) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== source)));
    };
    if (canOrders) {
      jobs.push([
        "orders",
        api.adminListAllOrders("active").then((r) => {
          if (!alive) return;
          if (api.isError(r)) return fail("orders", `orders: ${r.error.message}`);
          ok("orders");
          setSources((s) => ({ ...s, orders: r.data }));
        }),
      ]);
    }
    if (canAi) {
      jobs.push([
        "ai",
        authedFetch("/api/vision-costs", { cache: "no-store" })
          .then(async (res) => {
            if (!res.ok) throw new Error(`AI usage (${res.status})`);
            const json = (await res.json()) as VisionCostsJson;
            if (!alive) return;
            ok("ai");
            setSources((s) => ({
              ...s,
              ai: {
                errors: json.persisted?.recentErrors ?? [],
                calls: json.persisted?.recentEvents ?? [],
              },
            }));
          })
          .catch((e: unknown) => fail("ai", e instanceof Error ? e.message : "AI usage")),
      ]);
    }
    if (canPricing) {
      jobs.push([
        "pricing",
        api.adminGetPricing().then((r) => {
          if (!alive) return;
          if (api.isError(r)) return fail("pricing", `pricing: ${r.error.message}`);
          ok("pricing");
          setSources((s) => ({ ...s, pricing: r.data }));
        }),
      ]);
    }
    if (canFinance) {
      jobs.push([
        "finance",
        api.adminGetFinance(last30Days()).then((r) => {
          if (!alive) return;
          if (api.isError(r)) return fail("finance", `finance: ${r.error.message}`);
          ok("finance");
          setSources((s) => ({ ...s, finance: r.data }));
        }),
      ]);
    }
    for (const [name, job] of jobs) void job.finally(() => alive && setAnswered((a) => ({ ...a, [name]: tick })));
    return () => {
      alive = false;
    };
  }, [canOrders, canAi, canPricing, canFinance, tick]);

  // Read marks: the browser's copy right away, then the server's.
  useEffect(() => {
    let alive = true;
    void api.adminListAlertReads().then((r) => {
      if (!alive || api.isError(r)) return;
      setReads((prev) => {
        const next = new Set([...prev, ...r.data]);
        writeLocal(next);
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  const enabledSources = (
    [
      ["orders", canOrders],
      ["ai", canAi],
      ["pricing", canPricing],
      ["finance", canFinance],
    ] as const
  )
    .filter(([, on]) => on)
    .map(([name]) => name);

  const alerts = useMemo(() => buildAdminAlerts(sources, now), [sources, now]);
  const unread = useMemo(() => alerts.filter((a) => !reads.has(a.key)), [alerts, reads]);

  const markRead = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    setReads((prev) => {
      const next = new Set([...prev, ...keys]);
      writeLocal(next);
      return next;
    });
    void api.adminMarkAlertsRead(keys);
  }, []);

  const markUnread = useCallback((key: string) => {
    setReads((prev) => {
      const next = new Set(prev);
      next.delete(key);
      writeLocal(next);
      return next;
    });
    void api.adminMarkAlertUnread(key);
  }, []);

  const isRead = useCallback((key: string) => reads.has(key), [reads]);

  const refreshAlerts = useCallback(() => {
    setNow(Date.now());
    setTick((t) => t + 1);
  }, []);

  const ordersCount = useMemo(() => (sources.orders ? ordersNeedingAttention(sources.orders).length : null), [sources.orders]);
  const aiProblem = alerts.some((a) => a.source === "ai");

  return {
    alerts,
    unread,
    isRead,
    markRead,
    markUnread,
    loading: enabledSources.some((s) => answered[s] !== tick),
    errors: Object.values(errors),
    ordersNeedingAttention: ordersCount,
    aiProblem,
    refreshAlerts,
  };
}

// --- Collapsible columns ------------------------------------------------------------------------

export type AdminPane = "nav" | "alerts";

/** Which side columns this admin shrank to rails; a per-browser convenience. */
const COLLAPSED_KEY = "cm_admin_collapsed_panes";
const paneListeners = new Set<() => void>();

function readCollapsed(): string {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribeCollapsed(listener: () => void) {
  paneListeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === COLLAPSED_KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    paneListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Rail state for one side column. Server render and hydration show it open, then the saved choice applies. */
export function useAdminPaneCollapsed(pane: AdminPane): [boolean, (collapsed: boolean) => void] {
  const raw = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => "");
  const collapsed = raw.split(",").includes(pane);
  const setCollapsed = useCallback(
    (next: boolean) => {
      const panes = new Set(readCollapsed().split(",").filter(Boolean));
      if (next) panes.add(pane);
      else panes.delete(pane);
      try {
        window.localStorage.setItem(COLLAPSED_KEY, [...panes].join(","));
      } catch {
        // Storage blocked: the toggle just won't be remembered.
      }
      paneListeners.forEach((l) => l());
    },
    [pane],
  );
  return [collapsed, setCollapsed];
}

const RAIL_BADGE =
  "absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold tabular-nums text-white";

// --- Navigation ---------------------------------------------------------------------------------

const GROUP_LABEL: Record<V2AdminNavItem["group"], string | null> = {
  overview: null,
  operate: "Operate",
  money: "Money",
  grow: "Growth",
};

function NavBadge({ item, alerts, rail }: { item: V2AdminNavItem; alerts: AdminAlertsState; rail?: boolean }) {
  if (item.id === "orders" && alerts.ordersNeedingAttention) {
    const n = alerts.ordersNeedingAttention;
    return (
      <span
        className={cn(
          rail
            ? RAIL_BADGE
            : "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold tabular-nums text-white",
        )}
        aria-label={`${n} order${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} attention`}
      >
        {n}
      </span>
    );
  }
  if (item.id === "vision-costs" && alerts.aiProblem) {
    return (
      <span
        className={cn("h-2.5 w-2.5 rounded-full bg-red-600", rail ? "absolute right-2 top-2" : "ml-auto")}
        role="img"
        aria-label="Image service problem in the last day"
      />
    );
  }
  return null;
}

function AlertsNavLink({ alerts, className, rail }: { alerts: AdminAlertsState; className?: string; rail?: boolean }) {
  const pathname = usePathname();
  const active = pathname === "/admin/alerts";
  const n = alerts.unread.length;
  return (
    <Link
      href="/admin/alerts"
      aria-current={active ? "page" : undefined}
      title={rail ? "Alerts" : undefined}
      className={cn(
        "relative items-center gap-3 text-sm font-semibold transition-colors",
        active ? "bg-v2-primary-light text-v2-primary" : "text-v2-navy hover:bg-v2-bg-subtle hover:text-v2-ink",
        className,
      )}
    >
      <Bell className="h-4 w-4 shrink-0" aria-hidden />
      <span className={rail ? "sr-only" : undefined}>Alerts</span>
      {n ? (
        <span
          className={cn(
            rail
              ? RAIL_BADGE
              : "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold tabular-nums text-white",
          )}
          aria-label={`${n} unread alert${n === 1 ? "" : "s"}`}
        >
          {n}
        </span>
      ) : null}
    </Link>
  );
}

function AdminSidebar({ items, alerts }: { items: V2AdminNavItem[]; alerts: AdminAlertsState }) {
  const pathname = usePathname();
  const [rail, setRail] = useAdminPaneCollapsed("nav");
  const groups = (["overview", "operate", "grow", "money"] as const)
    .map((g) => ({ id: g, items: items.filter((i) => i.group === g) }))
    .filter((g) => g.items.length > 0);
  const linkClass = (active: boolean) =>
    cn(
      "relative flex h-10 items-center rounded-lg text-sm font-semibold transition-colors",
      rail ? "w-10 justify-center" : "gap-3 px-3",
      active ? "bg-v2-primary-light text-v2-primary" : "text-v2-navy hover:bg-v2-bg-subtle hover:text-v2-ink",
    );
  const ToggleIcon = rail ? PanelLeftOpen : PanelLeftClose;
  return (
    <nav
      aria-label="Admin"
      className={cn(
        "hidden shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-gray-200 bg-white py-5 lg:flex",
        rail ? "w-16 items-center px-3" : "w-60 px-3",
      )}
    >
      <div className={cn("mb-2 flex items-center", rail ? "justify-center" : "pl-3")}>
        {rail ? null : <p className="v2-section-title">Admin</p>}
        <button
          type="button"
          onClick={() => setRail(!rail)}
          aria-expanded={!rail}
          aria-label={rail ? "Expand admin menu" : "Collapse admin menu"}
          title={rail ? "Expand menu" : "Collapse menu"}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-md text-v2-muted hover:bg-v2-bg-subtle hover:text-v2-ink",
            !rail && "ml-auto",
          )}
        >
          <ToggleIcon className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {/* Wide screens show the alerts column beside the nav instead. */}
      <AlertsNavLink
        alerts={alerts}
        rail={rail}
        className={cn("mb-0.5 flex h-10 rounded-lg xl:hidden", rail ? "w-10 justify-center" : "px-3")}
      />
      {groups.map((g) => (
        <div key={g.id}>
          {GROUP_LABEL[g.id] ? (
            rail ? (
              <hr className="mx-auto my-3 w-8 border-gray-200" aria-hidden />
            ) : (
              <p className="v2-section-title mb-1 mt-5 px-3">{GROUP_LABEL[g.id]}</p>
            )
          ) : null}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isV2NavItemActive(pathname, item);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href ?? "#"}
                    aria-current={active ? "page" : undefined}
                    title={rail ? item.label : undefined}
                    className={linkClass(active)}
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className={rail ? "sr-only" : undefined}>{item.label}</span>
                    <NavBadge item={item} alerts={alerts} rail={rail} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <Link
        href={SIGNED_IN_HOME}
        title={rail ? "Back to the app" : undefined}
        className={cn(
          "mt-auto flex h-10 shrink-0 items-center gap-2 rounded-lg text-sm font-semibold text-v2-muted hover:text-v2-ink",
          rail ? "w-10 justify-center" : "px-3",
        )}
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        <span className={rail ? "sr-only" : undefined}>Back to the app</span>
      </Link>
    </nav>
  );
}

function AdminTabsMobile({ items, alerts }: { items: V2AdminNavItem[]; alerts: AdminAlertsState }) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);
  return (
    <nav aria-label="Admin" className="shrink-0 border-b border-gray-200 bg-white lg:hidden">
      <ul className="flex gap-1 overflow-x-auto px-4 py-1.5">
        <li className="shrink-0">
          <AlertsNavLink alerts={alerts} className="inline-flex h-9 gap-2 rounded-lg px-3" />
        </li>
        {items.map((item) => {
          const active = isV2NavItemActive(pathname, item);
          return (
            <li key={item.id} className="shrink-0">
              <Link
                ref={active ? activeRef : undefined}
                href={item.href ?? "#"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold",
                  active ? "bg-v2-primary-light text-v2-primary" : "text-v2-navy",
                )}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
                <NavBadge item={item} alerts={alerts} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// --- Shell --------------------------------------------------------------------------------------

/** Content column shared by every admin page. */
export const ADMIN_CONTENT = "mx-auto w-full max-w-[1400px] px-4 py-5 lg:px-8 lg:py-6";

/**
 * Every admin page: the app's top bar, a grouped sidebar on desktop (horizontal tabs on phones),
 * the unread alerts column on wide screens, and one scrolling content column.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const items = v2AdminNav.filter((item) => canOpenAdminItem(permissions, item));
  const alerts = useLoadAlerts(permissions);

  return (
    <AlertsContext.Provider value={alerts}>
      <V2StudioFrame
        sidebar={
          <>
            <AdminSidebar items={items} alerts={alerts} />
            <AdminAlertsColumn />
          </>
        }
      >
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col lg:overflow-hidden">
          <AdminTabsMobile items={items} alerts={alerts} />
          <main className="flex-1 bg-v2-bg pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:min-h-0 lg:overflow-y-auto lg:overscroll-y-contain lg:pb-10">
            <div className={ADMIN_CONTENT}>
              <Suspense fallback={null}>{children}</Suspense>
            </div>
          </main>
        </div>
      </V2StudioFrame>
    </AlertsContext.Provider>
  );
}
