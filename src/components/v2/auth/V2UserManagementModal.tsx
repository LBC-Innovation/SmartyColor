"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Gift,
  Loader2,
  Lock,
  Mail,
  Trash2,
  XCircle,
} from "lucide-react";
import type { AdminUser } from "@/lib/api/types";
import { PERMISSION_META } from "@/lib/auth/permissionMeta";
import * as api from "@/lib/api/client";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { V2UserAvatar } from "@/components/v2/ui/V2UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/cn";
import type { CreditLedgerEntry } from "@/lib/credits/types";

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "v2-badge",
        status === "active" ? "v2-badge--success" : "v2-badge--danger",
      )}
    >
      {status}
    </span>
  );
}

export function V2UserManagementModal({
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
  const [localUser, setLocalUser] = useState(user);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [password, setPassword] = useState("");
  const [creditDelta, setCreditDelta] = useState("1");
  const [creditNote, setCreditNote] = useState("");
  const [creditLedger, setCreditLedger] = useState<CreditLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, "ok" | "err">>({});

  const canAdjustCredits =
    me?.role === "admin" || (me?.permissions.includes("usermanage:adjustcredits") ?? false);

  useEffect(() => {
    setLocalUser(user);
    setDisplayName(user.displayName ?? "");
    setEmail(user.email ?? "");
  }, [user]);

  useEffect(() => {
    if (!canAdjustCredits) return;
    let cancelled = false;
    const loadLedger = async () => {
      setLedgerLoading(true);
      const result = await api.adminListUserCredits(user.id);
      if (!cancelled) {
        if (!api.isError(result)) setCreditLedger(result.data);
        setLedgerLoading(false);
      }
    };
    void loadLedger();
    return () => {
      cancelled = true;
    };
  }, [user.id, canAdjustCredits]);

  const patch = (changes: Partial<AdminUser>) => {
    const updated = { ...localUser, ...changes };
    setLocalUser(updated);
    onUpdate(updated);
  };

  const run = async (key: string, fn: () => Promise<{ ok: boolean }>) => {
    setBusy(key);
    setFlash((f) => {
      const next = { ...f };
      delete next[key];
      return next;
    });
    const ok = (await fn()).ok;
    setBusy(null);
    setFlash((f) => ({ ...f, [key]: ok ? "ok" : "err" }));
    setTimeout(() => {
      setFlash((f) => {
        const next = { ...f };
        delete next[key];
        return next;
      });
    }, 2000);
  };

  const displayLabel = localUser.displayName ?? localUser.email ?? "?";

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    await run("profile", async () => {
      const result = await api.adminUpdateUser(localUser.id, {
        display_name: displayName,
      });
      if (api.isError(result)) return { ok: false };
      patch({ displayName });
      return { ok: true };
    });
  }

  return (
    <V2Modal
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      title={
        <div className="flex items-center gap-3 pr-2">
          <V2UserAvatar name={displayLabel} src={localUser.avatarUrl} size={48} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-v2-ink">{displayLabel}</h2>
            {localUser.displayName ? (
              <p className="truncate text-sm text-v2-muted">{localUser.email}</p>
            ) : null}
          </div>
          <StatusBadge status={localUser.status} />
        </div>
      }
    >
      <div className="space-y-8 px-5 py-4 sm:px-6 sm:py-6">
        <section>
          <p className="v2-section-title mb-3">Profile</p>
          <form onSubmit={saveProfile} className="v2-panel space-y-3 p-4">
            <div>
              <label className="v2-label" htmlFor="displayName">
                Display name
              </label>
              <input
                id="displayName"
                className="v2-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={busy === "profile"} className="v2-btn-sm v2-btn-sm-primary">
                {busy === "profile" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {flash.profile === "ok" ? "Saved" : "Save profile"}
              </button>
            </div>
          </form>
        </section>

        <section>
          <p className="v2-section-title mb-3">Authentication</p>
          <div className="v2-panel space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-v2-ink">Email verification</p>
                <p className="flex items-center gap-1.5 text-xs text-v2-muted">
                  {localUser.emailConfirmed ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Verified
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5 text-amber-600" /> Unverified
                    </>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                {!localUser.emailConfirmed ? (
                  <button
                    type="button"
                    className="v2-btn-sm v2-btn-sm-primary"
                    disabled={busy === "verify"}
                    onClick={() =>
                      run("verify", async () => {
                        const r = await api.verifyUser(localUser.id);
                        if (api.isError(r)) return { ok: false };
                        patch({ emailConfirmed: true });
                        return { ok: true };
                      })
                    }
                  >
                    Verify
                  </button>
                ) : (
                  <button
                    type="button"
                    className="v2-btn-sm v2-btn-sm-danger"
                    disabled={busy === "unverify"}
                    onClick={() =>
                      run("unverify", async () => {
                        const r = await api.unverifyUser(localUser.id);
                        if (api.isError(r)) return { ok: false };
                        patch({ emailConfirmed: false });
                        return { ok: true };
                      })
                    }
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>

            {!localUser.emailConfirmed ? (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("email", async () => {
                    const r = await api.adminUpdateUserEmail(localUser.id, email);
                    if (api.isError(r)) return { ok: false };
                    patch({ email: r.data.email });
                    return { ok: true };
                  });
                }}
              >
                <label className="v2-label" htmlFor="admin-email">
                  Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  required
                  className="v2-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <div className="flex justify-end">
                  <button type="submit" disabled={busy === "email"} className="v2-btn-sm v2-btn-sm-primary">
                    Save email
                  </button>
                </div>
              </form>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-v2-ink">
                  <Mail className="h-4 w-4 text-v2-primary" aria-hidden />
                  Magic link
                </p>
                <p className="text-xs text-v2-muted">Send a passwordless sign-in link</p>
              </div>
              <button
                type="button"
                className="v2-btn-sm v2-btn-sm-primary"
                disabled={busy === "magic"}
                onClick={() =>
                  run("magic", async () => {
                    const r = await api.sendMagicLink(
                      localUser.id,
                      `${window.location.origin}/auth/callback`,
                    );
                    if (api.isError(r)) return { ok: false };
                    setMagicLinkSent(true);
                    setTimeout(() => setMagicLinkSent(false), 3000);
                    return { ok: true };
                  })
                }
              >
                {magicLinkSent ? "Sent!" : "Send link"}
              </button>
            </div>
          </div>
        </section>

        <section>
          <p className="v2-section-title mb-3">Security</p>
          <div className="v2-panel space-y-4 p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run("password", async () => {
                  const r = await api.adminResetPassword(localUser.id, password);
                  if (api.isError(r)) return { ok: false };
                  setPassword("");
                  return { ok: true };
                });
              }}
            >
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-v2-ink">
                <Lock className="h-4 w-4 text-v2-primary" aria-hidden />
                Reset password
              </p>
              <input
                type="password"
                minLength={6}
                required
                placeholder="New password (min. 6 characters)"
                className="v2-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="mt-2 flex justify-end">
                <button type="submit" disabled={busy === "password"} className="v2-btn-sm v2-btn-sm-primary">
                  Set password
                </button>
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4">
              <div>
                <p className="text-sm font-semibold text-v2-ink">Account status</p>
                <p className="text-xs text-v2-muted">
                  {localUser.status === "active"
                    ? "User can sign in"
                    : "User is suspended"}
                </p>
              </div>
              <button
                type="button"
                className={cn(
                  "v2-btn-sm",
                  localUser.status === "active" ? "v2-btn-sm-danger" : "v2-btn-sm-primary",
                )}
                disabled={busy === "status"}
                onClick={() =>
                  run("status", async () => {
                    const suspended = localUser.status === "suspended";
                    const r = suspended
                      ? await api.unsuspendUser(localUser.id)
                      : await api.suspendUser(localUser.id);
                    if (api.isError(r)) return { ok: false };
                    patch({ status: suspended ? "active" : "suspended" });
                    return { ok: true };
                  })
                }
              >
                {localUser.status === "active" ? "Suspend" : "Unsuspend"}
              </button>
            </div>
          </div>
        </section>

        {canAdjustCredits ? (
          <section>
            <p className="v2-section-title mb-3">Promo book credits</p>
            <div className="v2-panel space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-v2-ink">
                    <Gift className="h-4 w-4 text-v2-primary" aria-hidden />
                    Current balance
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-v2-ink">
                    {localUser.creditsBalance}{" "}
                    <span className="text-sm font-semibold text-v2-muted">
                      {localUser.creditsBalance === 1 ? "book credit" : "book credits"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-v2-muted">
                    One credit covers one standard coloring book order (when checkout is enabled).
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[1, 3, 5].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      className="v2-btn-sm v2-btn-sm-primary"
                      disabled={busy === "credits"}
                      onClick={() =>
                        run("credits", async () => {
                          const r = await api.adminAdjustUserCredits(localUser.id, {
                            delta: amount,
                            note: creditNote.trim() || `Granted ${amount} book credit(s)`,
                          });
                          if (api.isError(r)) return { ok: false };
                          patch({ creditsBalance: r.data.creditsBalance });
                          const ledger = await api.adminListUserCredits(localUser.id);
                          if (!api.isError(ledger)) setCreditLedger(ledger.data);
                          return { ok: true };
                        })
                      }
                    >
                      +{amount}
                    </button>
                  ))}
                </div>
              </div>

              <form
                className="space-y-3 border-t border-gray-100 pt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const delta = Number.parseInt(creditDelta, 10);
                  if (!Number.isInteger(delta) || delta === 0) return;
                  void run("credits", async () => {
                    const r = await api.adminAdjustUserCredits(localUser.id, {
                      delta,
                      note: creditNote.trim() || undefined,
                    });
                    if (api.isError(r)) return { ok: false };
                    patch({ creditsBalance: r.data.creditsBalance });
                    const ledger = await api.adminListUserCredits(localUser.id);
                    if (!api.isError(ledger)) setCreditLedger(ledger.data);
                    setCreditDelta(delta > 0 ? "1" : "-1");
                    return { ok: true };
                  });
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="v2-label" htmlFor="credit-delta">
                      Adjust by (+ grant / − revoke)
                    </label>
                    <input
                      id="credit-delta"
                      type="number"
                      className="v2-input"
                      value={creditDelta}
                      onChange={(e) => setCreditDelta(e.target.value)}
                      step={1}
                      min={-1000}
                      max={1000}
                      required
                    />
                  </div>
                  <div>
                    <label className="v2-label" htmlFor="credit-note">
                      Note (optional)
                    </label>
                    <input
                      id="credit-note"
                      type="text"
                      className="v2-input"
                      placeholder="e.g. Launch promo"
                      value={creditNote}
                      onChange={(e) => setCreditNote(e.target.value)}
                      maxLength={500}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busy === "credits"}
                    className="v2-btn-sm v2-btn-sm-primary"
                  >
                    {busy === "credits" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : null}
                    {flash.credits === "ok" ? "Updated" : "Apply adjustment"}
                  </button>
                </div>
              </form>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-v2-muted">
                  Recent activity
                </p>
                {ledgerLoading ? (
                  <p className="mt-2 text-sm text-v2-muted">Loading…</p>
                ) : creditLedger.length === 0 ? (
                  <p className="mt-2 text-sm text-v2-muted">No credit changes yet.</p>
                ) : (
                  <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                    {creditLedger.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-start justify-between gap-2 text-sm"
                      >
                        <span className="text-v2-ink">
                          {entry.delta > 0 ? "+" : ""}
                          {entry.delta}{" "}
                          <span className="text-v2-muted">
                            → balance {entry.balanceAfter}
                          </span>
                          {entry.note ? (
                            <span className="block text-xs text-v2-muted">{entry.note}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-xs text-v2-muted">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        ) : null}

        <section>
          <p className="v2-section-title mb-3">Permissions</p>
          <ul className="v2-panel divide-y divide-gray-100 p-2">
            {PERMISSION_META.map((perm) => (
              <li key={perm.key} className="flex items-center justify-between gap-3 px-2 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-v2-ink">{perm.name}</p>
                  <p className="text-xs text-v2-muted">{perm.description}</p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-v2-primary"
                  checked={localUser.permissions.includes(perm.key)}
                  disabled={busy === `perm-${perm.key}`}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    void run(`perm-${perm.key}`, async () => {
                      const next = checked
                        ? [...localUser.permissions, perm.key]
                        : localUser.permissions.filter((p) => p !== perm.key);
                      const r = await api.updateUserPermissions(localUser.id, next);
                      if (api.isError(r)) return { ok: false };
                      patch({ permissions: next });
                      return { ok: true };
                    });
                  }}
                />
              </li>
            ))}
          </ul>
        </section>

        <section>
          <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-wider text-red-600">
            Danger zone
          </p>
          <div className="rounded-xl border border-red-200 bg-red-50/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-v2-ink">Delete account</p>
                <p className="text-xs text-v2-muted">Permanently remove this user</p>
              </div>
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  className="v2-btn-sm v2-btn-sm-danger inline-flex items-center gap-1"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Delete
                </button>
              ) : (
                <div className="flex gap-2">
                  <button type="button" className="v2-btn-outline text-sm" onClick={() => setShowDeleteConfirm(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="v2-btn-sm v2-btn-sm-danger"
                    disabled={busy === "delete"}
                    onClick={() =>
                      run("delete", async () => {
                        const r = await api.deleteAdminUser(localUser.id);
                        if (api.isError(r)) return { ok: false };
                        onDelete(localUser.id);
                        return { ok: true };
                      })
                    }
                  >
                    Confirm delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </V2Modal>
  );
}
