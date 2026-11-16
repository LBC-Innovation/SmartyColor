"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowLeft } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { canOpenAdminItem, isV2NavItemActive, SIGNED_IN_HOME, v2AdminNav, type V2AdminNavItem } from "@/components/v2/nav-config";
import { aiHealth } from "@/components/v2/admin/aiHealth";
import { ordersNeedingAttention } from "@/components/v2/admin/orderAttention";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { authedFetch } from "@/lib/api/client";
import { cn } from "@/lib/cn";

// --- Alerts: the sidebar's badges ----------------------------------------------------------------

type AdminAlerts = {
  /** Orders that need the owner; null until loaded or without permission. */
  ordersNeedingAttention: number | null;
  /** An open billing, quota or sign-in problem: no successful call since the error (see aiHealth). */
  aiProblem: boolean;
  /** Pages call this after a change that may clear an alert. */
  refreshAlerts: () => void;
};

const AlertsContext = createContext<AdminAlerts>({ ordersNeedingAttention: null, aiProblem: false, refreshAlerts: () => {} });

export function useAdminAlerts(): AdminAlerts {
  return useContext(AlertsContext);
}

function useLoadAlerts(permissions: readonly string[]): AdminAlerts {
  const canOrders = permissions.includes("usermanage:manageorders");
  const canAi = permissions.includes("costs:viewai");
  const [orders, setOrders] = useState<number | null>(null);
  const [aiProblem, setAiProblem] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    if (canOrders) {
      void api.adminListAllOrders("active").then((r) => {
        if (alive && !api.isError(r)) setOrders(ordersNeedingAttention(r.data).length);
      });
    }
    if (canAi) {
      void authedFetch("/api/vision-costs", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (json: { persisted?: { recentErrors?: Array<{ at: string; kind: string }>; recentEvents?: Array<{ at: string }> } } | null) => {
            if (!alive || !json) return;
            const health = aiHealth(json.persisted?.recentErrors ?? [], json.persisted?.recentEvents ?? [], Date.now());
            setAiProblem(health.blocking != null || health.quota != null);
          },
        )
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [canOrders, canAi, tick]);

  const refreshAlerts = useCallback(() => setTick((t) => t + 1), []);
  return { ordersNeedingAttention: orders, aiProblem, refreshAlerts };
}

// --- Navigation ---------------------------------------------------------------------------------

const GROUP_LABEL: Record<V2AdminNavItem["group"], string | null> = {
  overview: null,
  operate: "Operate",
  money: "Money",
};

function NavBadge({ item, alerts }: { item: V2AdminNavItem; alerts: AdminAlerts }) {
  if (item.id === "orders" && alerts.ordersNeedingAttention) {
    const n = alerts.ordersNeedingAttention;
    return (
      <span
        className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold tabular-nums text-white"
        aria-label={`${n} order${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} attention`}
      >
        {n}
      </span>
    );
  }
  if (item.id === "vision-costs" && alerts.aiProblem) {
    return <span className="ml-auto h-2.5 w-2.5 rounded-full bg-red-600" role="img" aria-label="Image service problem in the last day" />;
  }
  return null;
}

function AdminSidebar({ items, alerts }: { items: V2AdminNavItem[]; alerts: AdminAlerts }) {
  const pathname = usePathname();
  const groups = (["overview", "operate", "money"] as const)
    .map((g) => ({ id: g, items: items.filter((i) => i.group === g) }))
    .filter((g) => g.items.length > 0);
  return (
    <nav aria-label="Admin" className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white px-3 py-5 lg:flex">
      <p className="v2-section-title mb-2 px-3">Admin</p>
      {groups.map((g) => (
        <div key={g.id}>
          {GROUP_LABEL[g.id] ? <p className="v2-section-title mb-1 mt-5 px-3">{GROUP_LABEL[g.id]}</p> : null}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isV2NavItemActive(pathname, item);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href ?? "#"}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors",
                      active ? "bg-v2-primary-light text-v2-primary" : "text-v2-navy hover:bg-v2-bg-subtle hover:text-v2-ink",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                    {item.label}
                    <NavBadge item={item} alerts={alerts} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <Link
        href={SIGNED_IN_HOME}
        className="mt-auto flex h-10 items-center gap-2 rounded-lg px-3 pt-6 text-sm font-semibold text-v2-muted hover:text-v2-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to the app
      </Link>
    </nav>
  );
}

function AdminTabsMobile({ items, alerts }: { items: V2AdminNavItem[]; alerts: AdminAlerts }) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);
  return (
    <nav aria-label="Admin" className="shrink-0 border-b border-gray-200 bg-white lg:hidden">
      <ul className="flex gap-1 overflow-x-auto px-4 py-1.5">
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
 * and one scrolling content column.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const items = v2AdminNav.filter((item) => canOpenAdminItem(permissions, item));
  const alerts = useLoadAlerts(permissions);

  return (
    <AlertsContext.Provider value={alerts}>
      <V2StudioFrame sidebar={<AdminSidebar items={items} alerts={alerts} />}>
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
