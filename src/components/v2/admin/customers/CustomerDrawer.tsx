"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EyeOff, Loader2, Mail, Package } from "lucide-react";
import type { AdminUser } from "@/lib/api/types";
import * as api from "@/lib/api/client";
import { useAuth } from "@/context/AuthContext";
import { V2UserAvatar } from "@/components/v2/ui/V2UserAvatar";
import { PRODUCT_FEATURES } from "@/lib/auth/features";
import { PERMISSION_META, type Permission } from "@/lib/auth/permissionMeta";
import type { AdminUserOrderSummary } from "@/lib/orders/adminTypes";
import { statusLabel } from "@/lib/orders/fulfillmentTimeline";
import { Drawer } from "@/components/v2/admin/Drawer";
import { DefinitionList, EmptyState, StatusPill, Switch, TabPanel, Tabs } from "@/components/v2/admin/ui";
import { count, fileSize, fullDateTime, money, ORDER_STATUS_TONE, relativeTime, shortDate, shortId, usdCost } from "@/components/v2/admin/format";
import { useUrlParam } from "@/components/v2/admin/useUrlParam";
import { CustomerWalletTab } from "@/components/v2/admin/customers/CustomerWalletTab";
import { CustomerAccountTab } from "@/components/v2/admin/customers/CustomerAccountTab";
import { customerName, customerStatus, useActions } from "@/components/v2/admin/customers/shared";
import { SavedNote } from "@/components/v2/admin/customers/SavedNote";
import { cn } from "@/lib/cn";

type TabId = "overview" | "wallet" | "access" | "account";

export function CustomerDrawer({
  user,
  onClose,
  onUpdate,
  onDelete,
}: {
  user: AdminUser;
  onClose: () => void;
  onUpdate: (user: AdminUser) => void;
  onDelete: (userId: string) => void;
}) {
  const { user: me } = useAuth();
  const can = (p: Permission) => me?.permissions.includes(p) ?? false;
  const [tabParam, setTabParam] = useUrlParam("tab");
  const magic = useActions();

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "overview", label: "Overview" },
    ...(can("usermanage:adjustcredits") ? [{ id: "wallet" as const, label: "Wallet" }] : []),
    { id: "access", label: "Access" },
    { id: "account", label: "Account" },
  ];
  const tab: TabId = tabs.some((t) => t.id === tabParam) ? (tabParam as TabId) : "overview";

  const patch = (changes: Partial<AdminUser>) => onUpdate({ ...user, ...changes });
  const status = customerStatus(user);
  const name = customerName(user);

  return (
    <Drawer
      onClose={onClose}
      width="lg"
      title={
        <span className="flex items-center gap-3">
          <V2UserAvatar name={name} src={user.avatarUrl} size={40} />
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate">{name}</span>
              <StatusPill tone={status.tone}>{status.label}</StatusPill>
            </span>
            {user.displayName && user.email ? <span className="block truncate text-sm font-normal text-v2-muted">{user.email}</span> : null}
          </span>
        </span>
      }
      headerActions={
        can("usermanage:magiclink") ? (
          <button
            type="button"
            className="v2-btn-sm v2-btn-sm-primary hidden sm:inline-flex"
            disabled={magic.busy === "magic"}
            onClick={() =>
              void magic.run("magic", async () => {
                const r = await api.sendMagicLink(user.id, `${window.location.origin}/auth/callback`);
                return api.isError(r) ? { ok: false, message: r.error.message } : { ok: true };
              })
            }
          >
            {magic.busy === "magic" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Mail className="h-3.5 w-3.5" aria-hidden />}
            {magic.flash.magic === "ok" ? "Link sent" : magic.flash.magic === "err" ? "Couldn't send" : "Send sign-in link"}
          </button>
        ) : null
      }
    >
      <div className="space-y-5">
        <Tabs idPrefix="customer" ariaLabel="Customer sections" tabs={tabs} value={tab} onChange={(id) => setTabParam(id === "overview" ? null : id)} />
        <TabPanel idPrefix="customer" id={tab}>
          {tab === "overview" ? <OverviewTab user={user} canManageOrders={can("usermanage:manageorders")} /> : null}
          {tab === "wallet" ? <CustomerWalletTab user={user} onBalance={(cents) => patch({ creditsBalanceCents: cents })} /> : null}
          {tab === "access" ? <AccessTab user={user} canEdit={can("usermanage:editpermissions")} patch={patch} /> : null}
          {tab === "account" ? <CustomerAccountTab user={user} patch={patch} onDelete={onDelete} /> : null}
        </TabPanel>
      </div>
    </Drawer>
  );
}

// --- Overview -----------------------------------------------------------------------------------

/** What this account has cost to serve: AI calls and keeping their images. Printing is per order. */
function CostSection({ user }: { user: AdminUser }) {
  const cost = user.lifetimeCost;
  if (cost === undefined) return null;
  return (
    <section aria-labelledby="customer-cost">
      <h3 id="customer-cost" className="mb-1 text-sm font-semibold text-v2-ink">
        Lifetime cost
      </h3>
      {cost === null ? (
        <p className="text-sm text-v2-muted">Cost numbers aren&apos;t available right now.</p>
      ) : (
        <DefinitionList
          items={[
            {
              label: "Total",
              value: usdCost(cost.totalUsd),
              note: "AI and image storage so far. Printing and shipping are counted on each order.",
            },
            {
              label: "AI",
              value: usdCost(cost.aiUsd),
              note: cost.aiCalls
                ? `${count(cost.aiCalls)} call${cost.aiCalls === 1 ? "" : "s"}: pages, edits, reframes and stories`
                : "No AI calls yet",
            },
            {
              label: "Image storage",
              value: usdCost(cost.storageUsd),
              note: cost.storageFiles
                ? `${fileSize(cost.storageBytes)} in ${count(cost.storageFiles)} files now, about ${usdCost(cost.storageMonthlyUsd)} a month`
                : "No saved images",
            },
          ]}
        />
      )}
    </section>
  );
}

function OverviewTab({ user, canManageOrders }: { user: AdminUser; canManageOrders: boolean }) {
  const [orders, setOrders] = useState<AdminUserOrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const hide = useActions();

  useEffect(() => {
    if (!canManageOrders) return;
    let alive = true;
    void api.adminListUserOrders(user.id, true).then((r) => {
      if (!alive) return;
      if (api.isError(r)) setError(r.error.message);
      else {
        setError(null);
        setOrders(r.data);
      }
    });
    return () => {
      alive = false;
    };
  }, [user.id, canManageOrders, reloadKey]);

  return (
    <div className="space-y-6">
      <DefinitionList
        items={[
          { label: "Joined", value: <span title={fullDateTime(user.createdAt)}>{shortDate(user.createdAt)}</span> },
          {
            label: "Last active",
            value: user.lastActiveAt ? <span title={fullDateTime(user.lastActiveAt)}>{relativeTime(user.lastActiveAt)}</span> : "Never",
          },
          { label: "Email verified", value: user.emailConfirmed ? "Yes" : "Not yet", tone: user.emailConfirmed ? "default" : "bad" },
          { label: "Orders", value: count(user.ordersCount ?? 0) },
          { label: "Lifetime spend", value: money(user.lifetimeSpendCents ?? 0), note: "Paid orders, not counting canceled or refunded ones" },
          { label: "Wallet balance", value: money(user.creditsBalanceCents), note: "Unspent credit, applied at checkout" },
        ]}
      />

      <CostSection user={user} />

      {canManageOrders ? (
        <section aria-labelledby="customer-orders">
          <h3 id="customer-orders" className="mb-2 text-sm font-semibold text-v2-ink">
            Book orders
          </h3>
          {error ? (
            <p className="text-sm text-red-700" role="alert">
              Couldn&apos;t load orders: {error}
            </p>
          ) : orders == null ? (
            <p className="flex items-center gap-2 text-sm text-v2-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading orders…
            </p>
          ) : orders.length === 0 ? (
            <div className="rounded-xl border border-gray-200">
              <EmptyState icon={Package} title="No orders yet." />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <caption className="sr-only">Book orders for this customer</caption>
                <thead className="bg-v2-bg-subtle text-xs text-v2-muted">
                  <tr>
                    <th scope="col" className="h-9 px-3 text-left font-semibold">
                      Album
                    </th>
                    <th scope="col" className="px-3 text-left font-semibold">
                      Status
                    </th>
                    <th scope="col" className="px-3 text-right font-semibold">
                      Charged
                    </th>
                    <th scope="col" className="px-3 text-left font-semibold">
                      Placed
                    </th>
                    <th scope="col" className="px-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const hidden = o.deletedAt != null;
                    return (
                      <tr key={o.id} className={cn("border-t border-gray-100", hidden && "text-v2-muted")}>
                        <td className="px-3 py-2">
                          <Link href={`/admin/orders?order=${o.id}`} className="font-semibold text-v2-link hover:underline">
                            {o.projectTitle ?? o.productName}
                          </Link>
                          <span className="block font-mono text-xs text-v2-muted">{shortId(o.id)}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex flex-wrap items-center gap-1">
                            <StatusPill tone={ORDER_STATUS_TONE[o.status]}>{statusLabel(o.status)}</StatusPill>
                            {hidden ? <StatusPill tone="neutral">Hidden</StatusPill> : null}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(o.totalCents)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <time dateTime={o.createdAt} title={fullDateTime(o.createdAt)}>
                            {relativeTime(o.createdAt)}
                          </time>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {!hidden ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline disabled:opacity-50"
                              disabled={hide.busy === o.id}
                              aria-label={`Hide order ${shortId(o.id)}`}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    "Hide this order? It will disappear from the customer's My orders list and will no longer sync with the printer. A paid order that can still be canceled is canceled and refunded first.",
                                  )
                                )
                                  return;
                                void hide
                                  .run(o.id, async () => {
                                    const r = await api.adminHideUserOrder(user.id, o.id);
                                    return api.isError(r) ? { ok: false, message: r.error.message } : { ok: true };
                                  })
                                  .then(() => setReloadKey((k) => k + 1));
                              }}
                            >
                              <EyeOff className="h-3.5 w-3.5" aria-hidden />
                              Hide
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {Object.values(hide.errors)[0] ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {Object.values(hide.errors)[0]}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

// --- Access -------------------------------------------------------------------------------------

const PERMISSION_GROUPS: Array<{ title: string; keys: Permission[] }> = [
  {
    title: "Customers",
    keys: [
      "usermanage:listusers",
      "usermanage:add",
      "usermanage:editprofile",
      "usermanage:changeemail",
      "usermanage:verifyemail",
      "usermanage:magiclink",
      "usermanage:suspend",
      "usermanage:updatepassword",
      "usermanage:deleteusers",
      "usermanage:editpermissions",
    ],
  },
  { title: "Orders", keys: ["usermanage:manageorders"] },
  { title: "Money", keys: ["finance:view", "finance:manage", "costs:viewai", "pricing:manage"] },
  { title: "Promotions", keys: ["usermanage:adjustcredits"] },
];

function AccessTab({ user, canEdit, patch }: { user: AdminUser; canEdit: boolean; patch: (c: Partial<AdminUser>) => void }) {
  const { busy, flash, errors, run } = useActions();
  const grouped = new Set(PERMISSION_GROUPS.flatMap((g) => g.keys));
  // Anything added to PERMISSION_META later still shows up.
  const groups = [
    ...PERMISSION_GROUPS,
    ...(PERMISSION_META.some((p) => !grouped.has(p.key)) ? [{ title: "Other", keys: PERMISSION_META.filter((p) => !grouped.has(p.key)).map((p) => p.key) }] : []),
  ];
  const meta = new Map(PERMISSION_META.map((p) => [p.key as Permission, p]));
  const lastError = Object.values(errors)[0];

  return (
    <div className="space-y-6">
      {!canEdit ? <p className="text-sm text-v2-muted">You can see this account&apos;s access but not change it.</p> : null}
      {lastError ? (
        <p className="text-sm text-red-700" role="alert">
          {lastError}
        </p>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-v2-ink">Product access</legend>
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {PRODUCT_FEATURES.map((feature) => {
            const key = `feature-${feature.key}`;
            const enabled = user.features[feature.key];
            return (
              <li key={feature.key} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-v2-ink">{feature.name}</p>
                  <p className="text-xs text-v2-muted">{feature.description}</p>
                </div>
                <span className="flex items-center gap-2">
                  <SavedNote state={flash[key]} />
                  <Switch
                    checked={enabled}
                    label={`${feature.name} access`}
                    disabled={!canEdit || busy === key}
                    onChange={(next) =>
                      void run(key, async () => {
                        const r = await api.updateUserFeatures(user.id, { [feature.key]: next });
                        if (api.isError(r)) return { ok: false, message: r.error.message };
                        patch({ features: r.data.features });
                        return { ok: true };
                      })
                    }
                  />
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-1.5 text-xs text-v2-muted">New accounts start with My albums only.</p>
      </fieldset>

      {groups.map((group) => (
        <fieldset key={group.title}>
          <legend className="mb-2 text-sm font-semibold text-v2-ink">{group.title}</legend>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {group.keys.map((permKey) => {
              const perm = meta.get(permKey);
              if (!perm) return null;
              const key = `perm-${permKey}`;
              const id = `perm-${user.id}-${permKey.replace(":", "-")}`;
              return (
                <li key={permKey} className="flex items-start gap-3 px-4 py-3">
                  <input
                    id={id}
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-v2-primary"
                    checked={user.permissions.includes(permKey)}
                    disabled={!canEdit || busy === key}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      void run(key, async () => {
                        const next = checked ? [...user.permissions, permKey] : user.permissions.filter((p) => p !== permKey);
                        const r = await api.updateUserPermissions(user.id, next);
                        if (api.isError(r)) return { ok: false, message: r.error.message };
                        patch({ permissions: next });
                        return { ok: true };
                      });
                    }}
                  />
                  <label htmlFor={id} className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-v2-ink">{perm.name}</span>
                    <span className="block text-xs text-v2-muted">{perm.description}</span>
                  </label>
                  <SavedNote state={flash[key]} />
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}
