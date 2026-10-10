"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { PERMISSION_META } from "@/lib/auth/permissionMeta";
import * as api from "@/lib/api/client";

export function V2CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await api.createAdminUser(email.trim(), password);
    setLoading(false);
    if (api.isError(result)) {
      setError(result.error.message);
      return;
    }
    if (permissions.length > 0) {
      await api.updateUserPermissions(result.data.id, permissions);
    }
    onCreated();
  }

  return (
    <V2Modal
      onClose={onClose}
      title={
        <div>
          <h2 className="v2-brand-title text-xl text-v2-ink">Add user</h2>
          <p className="mt-1 text-sm text-v2-muted">Create an account and optional permissions.</p>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5 px-5 py-4 sm:px-6 sm:py-5">
        <div>
          <label className="v2-label" htmlFor="new-email">
            Email
          </label>
          <input
            id="new-email"
            type="email"
            required
            className="v2-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="v2-label" htmlFor="new-password">
            Password
          </label>
          <input
            id="new-password"
            type="password"
            required
            minLength={6}
            className="v2-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div>
          <p className="v2-section-title mb-3">Permissions</p>
          <ul className="space-y-3">
            {PERMISSION_META.map((perm) => (
              <li key={perm.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-v2-ink">{perm.name}</p>
                  <p className="text-xs text-v2-muted">{perm.description}</p>
                </div>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-v2-primary"
                  checked={permissions.includes(perm.key)}
                  onChange={(e) =>
                    setPermissions((prev) =>
                      e.target.checked
                        ? [...prev, perm.key]
                        : prev.filter((p) => p !== perm.key),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button type="button" className="v2-btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={loading} className="v2-btn-primary">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create user
          </button>
        </div>
      </form>
    </V2Modal>
  );
}
