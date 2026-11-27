"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Users } from "lucide-react";
import type { AdminUser } from "@/lib/api/types";
import * as api from "@/lib/api/client";
import { useAuth } from "@/context/AuthContext";
import { V2UserAvatar } from "@/components/v2/ui/V2UserAvatar";
import { V2CreateUserModal } from "@/components/v2/auth/V2CreateUserModal";
import { DataTable, type Column } from "@/components/v2/admin/DataTable";
import { EmptyState, ErrorPanel, PageHeader, RefreshButton, SearchInput, StatusPill, TabPanel, Tabs } from "@/components/v2/admin/ui";
import { count, fullDateTime, money, relativeTime, shortDate, usdCost } from "@/components/v2/admin/format";
import { useUrlParam } from "@/components/v2/admin/useUrlParam";
import { CustomerDrawer } from "@/components/v2/admin/customers/CustomerDrawer";
import { customerName, customerStatus, isStaff, useSetUrlParams } from "@/components/v2/admin/customers/shared";

type FilterId = "all" | "paying" | "staff" | "suspended" | "unverified";

const FILTERS: Array<{ id: FilterId; label: string; test: (u: AdminUser) => boolean }> = [
  { id: "all", label: "All", test: () => true },
  // Paid real money: by card (top-up or card purchase), or bought something when card data is unavailable.
  { id: "paying", label: "Paying", test: (u) => (u.cardPaidCents != null ? u.cardPaidCents > 0 : (u.lifetimeSpendCents ?? 0) > 0) },
  { id: "staff", label: "Staff", test: isStaff },
  { id: "suspended", label: "Suspended", test: (u) => u.status === "suspended" },
  { id: "unverified", label: "Unverified", test: (u) => !u.emailConfirmed },
];

function When({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="text-v2-muted">Never</span>;
  return (
    <time dateTime={iso} title={fullDateTime(iso)}>
      {relativeTime(iso)}
    </time>
  );
}

function CustomerCell({ user }: { user: AdminUser }) {
  const name = customerName(user);
  return (
    <span className="flex min-w-0 items-center gap-3">
      <V2UserAvatar name={name} src={user.avatarUrl} size={32} />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold text-v2-ink">{name}</span>
          {isStaff(user) ? <StatusPill tone="neutral">Staff</StatusPill> : null}
        </span>
        {user.displayName && user.email ? <span className="block truncate text-xs text-v2-muted">{user.email}</span> : null}
      </span>
    </span>
  );
}

export function CustomersStudio() {
  const { user: me } = useAuth();
  const canAdd = me?.permissions.includes("usermanage:add") ?? false;
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId] = useUrlParam("user");
  const setParams = useSetUrlParams();

  useEffect(() => {
    let alive = true;
    void api.listAdminUsers().then((result) => {
      if (!alive) return;
      setLoading(false);
      if (api.isError(result)) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setUsers(result.data);
    });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  function reload() {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, users.filter(f.test).length])) as Record<FilterId, number>,
    [users],
  );

  const visible = useMemo(() => {
    const test = FILTERS.find((f) => f.id === filter)!.test;
    const q = query.trim().toLowerCase();
    return users.filter(
      (u) => test(u) && (!q || (u.email ?? "").toLowerCase().includes(q) || (u.displayName ?? "").toLowerCase().includes(q)),
    );
  }, [users, filter, query]);

  const selected = openId ? (users.find((u) => u.id === openId) ?? null) : null;

  const columns: Column<AdminUser>[] = [
    {
      key: "customer",
      header: "Customer",
      cell: (u) => <CustomerCell user={u} />,
      sortValue: (u) => customerName(u).toLowerCase(),
    },
    {
      key: "joined",
      header: "Joined",
      cell: (u) => (
        <time dateTime={u.createdAt} title={fullDateTime(u.createdAt)}>
          {shortDate(u.createdAt)}
        </time>
      ),
      sortValue: (u) => u.createdAt,
      hideBelow: "lg",
    },
    { key: "active", header: "Last active", cell: (u) => <When iso={u.lastActiveAt} />, sortValue: (u) => u.lastActiveAt ?? "" },
    { key: "orders", header: "Orders", align: "right", cell: (u) => count(u.ordersCount ?? 0), sortValue: (u) => u.ordersCount ?? 0 },
    {
      key: "spent",
      header: "Spent",
      align: "right",
      cell: (u) => money(u.lifetimeSpendCents ?? 0),
      sortValue: (u) => u.lifetimeSpendCents ?? 0,
    },
    {
      key: "card",
      header: "Card paid",
      align: "right",
      hideBelow: "lg",
      cell: (u) => (u.cardPaidCents == null ? "—" : money(u.cardPaidCents)),
      sortValue: (u) => u.cardPaidCents ?? null,
    },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      hideBelow: "xl",
      cell: (u) => (u.lifetimeCost ? usdCost(u.lifetimeCost.totalUsd) : "—"),
      sortValue: (u) => u.lifetimeCost?.totalUsd ?? null,
    },
    { key: "wallet", header: "Wallet", align: "right", cell: (u) => money(u.creditsBalanceCents), sortValue: (u) => u.creditsBalanceCents },
    {
      key: "status",
      header: "Status",
      cell: (u) => {
        const s = customerStatus(u);
        return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
      },
      sortValue: (u) => customerStatus(u).label,
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone with an account. Spent counts wallet and card purchases together. Click one to see their orders, payments and access."
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} placeholder="Name or email…" label="Search customers" />
            <RefreshButton onClick={reload} loading={loading} />
            {canAdd ? (
              <button type="button" className="v2-btn-primary h-9 py-0" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                Add user
              </button>
            ) : null}
          </>
        }
      />

      {error ? (
        <ErrorPanel>Couldn&apos;t load customers: {error}</ErrorPanel>
      ) : (
        <div className="space-y-4">
          <Tabs
            idPrefix="customers"
            ariaLabel="Filter customers"
            value={filter}
            onChange={setFilter}
            tabs={FILTERS.map((f) => ({ id: f.id, label: f.label, count: loading && users.length === 0 ? undefined : counts[f.id] }))}
          />
          <TabPanel idPrefix="customers" id={filter}>
            <DataTable
              caption="Customers"
              columns={columns}
              rows={visible}
              rowKey={(u) => u.id}
              loading={loading}
              defaultSort={{ key: "active", dir: "desc" }}
              selectedKey={openId}
              onRowClick={(u) => setParams({ user: u.id, tab: null })}
              rowLabel={(u) => `Open ${customerName(u)}`}
              empty={
                <EmptyState icon={Users} title={query ? "No one matches that search." : "No accounts here."}>
                  {query ? "Try part of their name or email." : null}
                </EmptyState>
              }
              mobileCard={(u) => {
                const s = customerStatus(u);
                return (
                  <span className="flex items-center justify-between gap-3">
                    <CustomerCell user={u} />
                    <span className="shrink-0 text-right text-sm">
                      <span className="block font-semibold tabular-nums text-v2-ink">{money(u.lifetimeSpendCents ?? 0)}</span>
                      <StatusPill tone={s.tone} className="mt-1">
                        {s.label}
                      </StatusPill>
                    </span>
                  </span>
                );
              }}
            />
          </TabPanel>
        </div>
      )}

      {selected ? (
        <CustomerDrawer
          key={selected.id}
          user={selected}
          onClose={() => setParams({ user: null, tab: null })}
          onUpdate={(updated) => setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))}
          onDelete={(id) => {
            setParams({ user: null, tab: null });
            setUsers((prev) => prev.filter((u) => u.id !== id));
          }}
        />
      ) : null}

      {creating ? (
        <V2CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      ) : null}
    </>
  );
}
