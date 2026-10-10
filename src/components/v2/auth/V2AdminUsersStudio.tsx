"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import type { AdminUser } from "@/lib/api/types";
import * as api from "@/lib/api/client";
import { V2Sidebar, V2StudioFrame } from "@/components/v2/V2Chrome";
import { useAuth } from "@/context/AuthContext";
import { V2UserAvatar } from "@/components/v2/ui/V2UserAvatar";
import { V2CreateUserModal } from "@/components/v2/auth/V2CreateUserModal";
import { V2UserManagementModal } from "@/components/v2/auth/V2UserManagementModal";
import { cn } from "@/lib/cn";

export function V2AdminUsersStudio() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const canAdd = me?.permissions.includes("usermanage:add") ?? false;

  const load = async () => {
    setIsLoading(true);
    const result = await api.listAdminUsers();
    setIsLoading(false);
    if (api.isError(result)) {
      setLoadError(result.error.message);
      return;
    }
    setLoadError(null);
    setUsers(result.data);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <V2StudioFrame sidebar={<V2Sidebar showProgress={false} />}>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-8">
        <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 sm:py-8">
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="v2-brand-title text-2xl tracking-tight text-v2-ink sm:text-3xl">
                User management
              </h1>
              <p className="mt-2 text-sm text-v2-muted sm:text-base">
                Manage accounts, permissions, and access for ColorfulMoments.
              </p>
            </div>
            {canAdd ? (
              <button
                type="button"
                className="v2-btn-primary shrink-0"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add user
              </button>
            ) : null}
          </header>

          {loadError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Failed to load users: {loadError}
            </div>
          ) : (
            <div className="v2-panel overflow-hidden">
              <div className="hidden border-b border-gray-200 bg-v2-bg-subtle/80 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-v2-muted sm:grid sm:grid-cols-[1fr_100px_120px_100px_88px] sm:gap-3">
                <span>User</span>
                <span>Status</span>
                <span>Permissions</span>
                <span>Joined</span>
                <span className="text-right"> </span>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-16 text-v2-muted">
                  <Loader2 className="h-6 w-6 animate-spin text-v2-primary" aria-hidden />
                  Loading users…
                </div>
              ) : users.length === 0 ? (
                <p className="px-4 py-16 text-center text-sm text-v2-muted">No users found.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {users.map((user) => {
                    const label = user.displayName ?? user.email ?? "?";
                    return (
                      <li key={user.id}>
                        <button
                          type="button"
                          className="flex w-full flex-col gap-3 px-4 py-4 text-left transition hover:bg-v2-bg-subtle/60 sm:grid sm:grid-cols-[1fr_100px_120px_100px_88px] sm:items-center sm:gap-3"
                          onClick={() => setSelectedUser(user)}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <V2UserAvatar name={label} src={user.avatarUrl} size={40} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-v2-ink">{label}</p>
                              <p className="truncate text-xs text-v2-muted">{user.email}</p>
                            </div>
                          </div>
                          <span
                            className={cn(
                              "v2-badge w-fit",
                              user.status === "active" ? "v2-badge--success" : "v2-badge--danger",
                            )}
                          >
                            {user.status}
                          </span>
                          <span className="text-sm text-v2-muted">
                            {user.permissions.length > 0
                              ? `${user.permissions.length} granted`
                              : "None"}
                          </span>
                          <span className="text-sm text-v2-muted">
                            {new Date(user.createdAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          <span className="sm:text-right">
                            <span className="v2-btn-sm v2-btn-sm-primary">Manage</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </main>

      {selectedUser ? (
        <V2UserManagementModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onUpdate={(updated) => {
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
            setSelectedUser(updated);
          }}
          onDelete={(userId) => {
            setUsers((prev) => prev.filter((u) => u.id !== userId));
            setSelectedUser(null);
          }}
        />
      ) : null}

      {showCreateModal ? (
        <V2CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreated={async () => {
            setShowCreateModal(false);
            await load();
          }}
        />
      ) : null}
    </V2StudioFrame>
  );
}
