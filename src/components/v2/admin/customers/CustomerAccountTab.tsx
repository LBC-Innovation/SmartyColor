"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, Trash2, XCircle } from "lucide-react";
import type { AdminUser } from "@/lib/api/types";
import type { Permission } from "@/lib/auth/permissionMeta";
import * as api from "@/lib/api/client";
import { useAuth } from "@/context/AuthContext";
import { useActions } from "@/components/v2/admin/customers/shared";
import { SavedNote } from "@/components/v2/admin/customers/SavedNote";

function Block({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-gray-100 pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-v2-ink">{title}</h3>
      {description ? <p className="mt-0.5 text-xs text-v2-muted">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

type Result = { ok: true } | { ok: false; message?: string };
const done = (r: { error: { message: string } } | { error: null }): Result =>
  r.error ? { ok: false, message: r.error.message } : { ok: true };

/** Profile, sign-in and account status, then deletion behind a typed confirmation. */
export function CustomerAccountTab({
  user,
  patch,
  onDelete,
}: {
  user: AdminUser;
  patch: (changes: Partial<AdminUser>) => void;
  onDelete: (userId: string) => void;
}) {
  const { user: me } = useAuth();
  const can = (p: Permission) => me?.permissions.includes(p) ?? false;
  const { busy, flash, errors, run } = useActions();
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [password, setPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typedEmail, setTypedEmail] = useState("");

  const error = (key: string) =>
    errors[key] ? (
      <p className="mt-2 text-sm text-red-700" role="alert">
        {errors[key]}
      </p>
    ) : null;

  const deleteTarget = (user.email ?? "").trim().toLowerCase();
  const deleteReady = deleteTarget !== "" && typedEmail.trim().toLowerCase() === deleteTarget;

  return (
    <div className="space-y-5">
      <Block title="Display name">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run("profile", async () => {
              const r = await api.adminUpdateUser(user.id, { display_name: displayName });
              if (!r.error) patch({ displayName: displayName || null });
              return done(r);
            });
          }}
        >
          <label htmlFor="account-name" className="sr-only">
            Display name
          </label>
          <input
            id="account-name"
            className="v2-input max-w-sm flex-1"
            autoComplete="off"
            autoCapitalize="words"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <button type="submit" className="v2-btn-sm v2-btn-sm-primary" disabled={busy === "profile" || displayName === (user.displayName ?? "")}>
            {busy === "profile" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Save
          </button>
          <SavedNote state={flash.profile} />
        </form>
        {error("profile")}
      </Block>

      <Block
        title="Email"
        description={
          <span className="inline-flex items-center gap-1.5">
            {user.emailConfirmed ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> Verified
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5 text-amber-600" aria-hidden /> Not verified yet
              </>
            )}
          </span>
        }
      >
        {can("usermanage:changeemail") && !user.emailConfirmed ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run("email", async () => {
                const r = await api.adminUpdateUserEmail(user.id, email);
                if (!r.error) patch({ email: r.data.email });
                return done(r);
              });
            }}
          >
            <label htmlFor="account-email" className="sr-only">
              Email
            </label>
            <input
              id="account-email"
              type="email"
              required
              className="v2-input max-w-sm flex-1"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="v2-btn-sm v2-btn-sm-primary" disabled={busy === "email" || email === (user.email ?? "")}>
              Save email
            </button>
            <SavedNote state={flash.email} />
          </form>
        ) : (
          <p className="text-sm text-v2-ink">{user.email ?? "—"}</p>
        )}
        {can("usermanage:changeemail") && user.emailConfirmed ? (
          <p className="mt-1 text-xs text-v2-muted">A verified email can only be changed by the customer.</p>
        ) : null}
        {error("email")}

        {can("usermanage:verifyemail") ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {user.emailConfirmed ? (
              <button
                type="button"
                className="v2-btn-sm v2-btn-sm-danger"
                disabled={busy === "verify"}
                onClick={() =>
                  void run("verify", async () => {
                    const r = await api.unverifyUser(user.id);
                    if (!r.error) patch({ emailConfirmed: false });
                    return done(r);
                  })
                }
              >
                Mark unverified
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="v2-btn-sm v2-btn-sm-primary"
                  disabled={busy === "verify"}
                  onClick={() =>
                    void run("verify", async () => {
                      const r = await api.verifyUser(user.id);
                      if (!r.error) patch({ emailConfirmed: true });
                      return done(r);
                    })
                  }
                >
                  Mark verified
                </button>
                <button
                  type="button"
                  className="v2-btn-sm v2-btn-outline"
                  disabled={busy === "resend"}
                  onClick={() => void run("resend", async () => done(await api.resendVerificationEmail(user.id)))}
                >
                  {flash.resend === "ok" ? "Email sent" : "Resend verification email"}
                </button>
              </>
            )}
            <SavedNote state={flash.verify} />
          </div>
        ) : null}
        {error("verify")}
        {error("resend")}
      </Block>

      {can("usermanage:updatepassword") ? (
        <Block title="Reset password" description="Sets a new password now. Tell the customer what it is, or send a sign-in link instead.">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run("password", async () => {
                const r = await api.adminResetPassword(user.id, password);
                if (!r.error) setPassword("");
                return done(r);
              });
            }}
          >
            <label htmlFor="account-password" className="sr-only">
              New password
            </label>
            <input
              id="account-password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              placeholder="New password (6+ characters)"
              className="v2-input max-w-sm flex-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" className="v2-btn-sm v2-btn-sm-primary" disabled={busy === "password"}>
              Set password
            </button>
            <SavedNote state={flash.password} />
          </form>
          {error("password")}
        </Block>
      ) : null}

      {can("usermanage:suspend") ? (
        <Block
          title="Account status"
          description={user.status === "suspended" ? "Suspended: they can't sign in." : "Active: they can sign in."}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={user.status === "suspended" ? "v2-btn-sm v2-btn-sm-primary" : "v2-btn-sm v2-btn-sm-danger"}
              disabled={busy === "status"}
              onClick={() =>
                void run("status", async () => {
                  const suspended = user.status === "suspended";
                  const r = suspended ? await api.unsuspendUser(user.id) : await api.suspendUser(user.id);
                  if (!r.error) patch({ status: suspended ? "active" : "suspended" });
                  return done(r);
                })
              }
            >
              {user.status === "suspended" ? "Unsuspend" : "Suspend"}
            </button>
            <SavedNote state={flash.status} />
          </div>
          {error("status")}
        </Block>
      ) : null}

      {can("usermanage:deleteusers") ? (
        <section className="rounded-xl border border-red-200 bg-red-50/60 p-4">
          <h3 className="text-sm font-semibold text-red-800">Danger zone</h3>
          <p className="mt-0.5 text-xs text-red-900/80">
            Deleting removes the account, its albums and its wallet for good. Book orders are kept, unlinked from the account.
          </p>
          {!confirmDelete ? (
            <button type="button" className="v2-btn-sm v2-btn-sm-danger mt-3" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete account
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <label htmlFor="account-delete-confirm" className="block text-sm text-red-900">
                Type <strong className="font-semibold">{user.email ?? "their email"}</strong> to confirm.
              </label>
              <input
                id="account-delete-confirm"
                className="v2-input max-w-sm"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={typedEmail}
                onChange={(e) => setTypedEmail(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="v2-btn-sm v2-btn-outline"
                  onClick={() => {
                    setConfirmDelete(false);
                    setTypedEmail("");
                  }}
                >
                  Keep account
                </button>
                <button
                  type="button"
                  className="v2-btn-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  disabled={!deleteReady || busy === "delete"}
                  onClick={() =>
                    void run("delete", async () => {
                      const r = await api.deleteAdminUser(user.id);
                      if (!r.error) onDelete(user.id);
                      return done(r);
                    })
                  }
                >
                  {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                  Delete for good
                </button>
              </div>
              {error("delete")}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
