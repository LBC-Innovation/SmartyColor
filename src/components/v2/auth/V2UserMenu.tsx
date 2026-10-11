"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  CircleHelp,
  KeyRound,
  Loader2,
  LogOut,
  Shield,
  User,
  UserPen,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useV2WelcomeGuide } from "@/components/v2/onboarding/V2WelcomeGuide";
import * as api from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { V2UserAvatar } from "@/components/v2/ui/V2UserAvatar";
import { useV2Toast } from "@/components/v2/V2Toast";

type OpenModal = "profile" | "password" | null;

const ITEM_CLASS =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-v2-navy transition hover:bg-v2-bg-subtle hover:text-v2-ink";

/** Avatar button in the header; opens a small account dropdown. */
export function V2UserMenu() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const welcomeGuide = useV2WelcomeGuide();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<OpenModal>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (loading) {
    return (
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-v2-bg-subtle text-v2-muted">
        <User className="h-5 w-5" aria-hidden />
      </span>
    );
  }

  if (!user) {
    return (
      <Link
        href="/sign-in"
        className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-v2-link hover:bg-v2-bg-subtle"
      >
        <User className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  const name = user.displayName || user.email.split("@")[0];
  const isAdmin =
    user.role === "admin" || user.permissions.includes("usermanage:listusers");

  function pick(next: OpenModal) {
    setOpen(false);
    setModal(next);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="flex max-w-[10rem] items-center gap-1.5 rounded-full py-1 pl-1 pr-2 transition hover:bg-v2-bg-subtle sm:max-w-[12rem]"
        title={`Signed in as ${user.email}`}
      >
        <V2UserAvatar name={name} src={user.avatarUrl} size={36} shape="circle" />
        <span className="hidden truncate text-xs font-semibold text-v2-navy sm:block">
          {name}
        </span>
        <ChevronDown
          className={cn(
            "hidden h-4 w-4 shrink-0 text-v2-muted transition-transform sm:block",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-gray-200 bg-v2-surface shadow-[0_12px_32px_rgb(10_16_26/0.14)]"
        >
          <div className="border-b border-gray-200 px-3.5 py-3">
            <p className="truncate text-sm font-semibold text-v2-ink">{name}</p>
            <p className="truncate text-xs text-v2-muted">{user.email}</p>
</div>

          <div className="p-1">
            <button
              type="button"
              role="menuitem"
              className={ITEM_CLASS}
              onClick={() => pick("profile")}
            >
              <UserPen className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
              Edit profile
            </button>
            <button
              type="button"
              role="menuitem"
              className={ITEM_CLASS}
              onClick={() => pick("password")}
            >
              <KeyRound
                className="h-4 w-4 shrink-0 text-v2-muted"
                aria-hidden
              />
              Change password
            </button>
            {isAdmin ? (
              <Link
                href="/admin/users"
                role="menuitem"
                className={ITEM_CLASS}
                onClick={() => setOpen(false)}
              >
                <Shield
                  className="h-4 w-4 shrink-0 text-v2-muted"
                  aria-hidden
                />
                Admin
              </Link>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className={ITEM_CLASS}
              onClick={() => {
                setOpen(false);
                welcomeGuide.open();
              }}
            >
              <CircleHelp className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
              Welcome guide
            </button>
          </div>

          <hr className="border-gray-200" />

          <div className="p-1">
            <button
              type="button"
              role="menuitem"
              className={cn(
                ITEM_CLASS,
                "text-red-700 hover:bg-red-50 hover:text-red-800",
              )}
              onClick={() => {
                setOpen(false);
                void signOut().then(() => router.replace("/"));
              }}
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              Log out
            </button>
          </div>
        </div>
      ) : null}

      {modal === "profile" ? (
        <EditProfileModal onClose={() => setModal(null)} />
      ) : null}
      {modal === "password" ? (
        <ChangePasswordModal onClose={() => setModal(null)} />
      ) : null}
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
      role="alert"
    >
      {message}
    </p>
  );
}

export function EditProfileModal({ onClose }: { onClose: () => void }) {
  const { user, refreshUser } = useAuth();
  const toast = useV2Toast();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const me = user;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const nextName = displayName.trim();
    if (nextName !== (me.displayName ?? "")) {
      const res = await api.adminUpdateUser(me.id, { display_name: nextName });
      if (api.isError(res)) {
        setError(res.error.message);
        setSaving(false);
        return;
      }
    }
    const nextEmail = email.trim();
    if (nextEmail && nextEmail !== me.email) {
      const res = await api.adminUpdateUserEmail(me.id, nextEmail);
      if (api.isError(res)) {
        setError(res.error.message);
        setSaving(false);
        return;
      }
    }

    await refreshUser();
    setSaving(false);
    onClose();
    toast.success({
      title: "Profile updated",
      message: "Your changes have been saved.",
    });
  }

  return (
    <V2Modal
      onClose={onClose}
      maxWidthClass="max-w-md"
      title={
        <div>
          <h2 className="v2-brand-title text-xl text-v2-ink">Edit profile</h2>
          <p className="mt-1 text-sm text-v2-muted">
            Update how your name and email appear.
          </p>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5 px-5 py-4 sm:px-6 sm:py-5">
        <div>
          <label className="v2-label" htmlFor="profile-name">
            Display name
          </label>
          <input
            id="profile-name"
            type="text"
            className="v2-input"
            value={displayName}
            maxLength={80}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div>
          <label className="v2-label" htmlFor="profile-email">
            Email
          </label>
          <input
            id="profile-email"
            type="email"
            required
            className="v2-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button type="button" className="v2-btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className="v2-btn-primary">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Save changes
          </button>
        </div>
      </form>
    </V2Modal>
  );
}

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const toast = useV2Toast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const me = user;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await api.adminResetPassword(me.id, password);
    setSaving(false);
    if (api.isError(res)) {
      setError(res.error.message);
      return;
    }
    onClose();
    toast.success({
      title: "Password updated",
      message: "Use your new password next time you sign in.",
    });
  }

  return (
    <V2Modal
      onClose={onClose}
      maxWidthClass="max-w-md"
      title={
        <div>
          <h2 className="v2-brand-title text-xl text-v2-ink">
            Change password
          </h2>
          <p className="mt-1 text-sm text-v2-muted">
            Choose a new password for your account.
          </p>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5 px-5 py-4 sm:px-6 sm:py-5">
        <div>
          <label className="v2-label" htmlFor="pw-new">
            New password
          </label>
          <input
            id="pw-new"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="v2-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="v2-label" htmlFor="pw-confirm">
            Confirm new password
          </label>
          <input
            id="pw-confirm"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="v2-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button type="button" className="v2-btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className="v2-btn-primary">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Update password
          </button>
        </div>
      </form>
    </V2Modal>
  );
}
