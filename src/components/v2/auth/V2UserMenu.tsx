"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  CircleHelp,
  CircleUser,
  KeyRound,
  Loader2,
  LogOut,
  Package,
  ReceiptText,
  Shield,
  User,
  UserPen,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useV2WelcomeGuide } from "@/components/v2/onboarding/V2WelcomeGuide";
import * as api from "@/lib/api/client";
import { useVisibleNav } from "@/components/v2/V2Chrome";
import { ADMIN_PERMISSIONS, isV2NavItemActive, v2BottomNav } from "@/components/v2/nav-config";
import { cn } from "@/lib/cn";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { V2UserAvatar } from "@/components/v2/ui/V2UserAvatar";
import { useV2Toast } from "@/components/v2/V2Toast";

type OpenModal = "profile" | "password" | null;

const ITEM_CLASS =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-v2-navy transition hover:bg-v2-bg-subtle hover:text-v2-ink";

/**
 * Guests: a plain Sign in link on desktop. On phones, where the studio can hide the bottom tab
 * bar, it's a small menu that also offers the other tabs next to Sign in.
 */
function GuestEntry() {
  const pathname = usePathname();
  const nav = useVisibleNav(v2BottomNav);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const tabs = nav.items.filter((item) => item.href && item.id !== "home" && !isV2NavItemActive(pathname, item));

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

  const signIn = (
    <Link
      href="/sign-in"
      aria-label="Sign in"
      className="v2-hit inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-v2-link hover:bg-v2-bg-subtle"
    >
      <User className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Sign in</span>
    </Link>
  );
  if (tabs.length === 0) return signIn;

  return (
    <>
      <div className="hidden lg:block">{signIn}</div>
      <div ref={rootRef} className="relative lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label="Menu"
          className="v2-hit inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-v2-link hover:bg-v2-bg-subtle"
        >
          <User className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Menu</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        {open ? (
          <div
            id={menuId}
            role="menu"
            aria-label="Menu"
            className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-gray-200 bg-v2-surface p-1 shadow-[0_12px_32px_rgb(10_16_26/0.14)]"
          >
            {tabs.map((tab) => (
              <Link key={tab.id} href={tab.href!} role="menuitem" className={ITEM_CLASS} onClick={() => setOpen(false)}>
                <tab.icon className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
                {tab.label}
              </Link>
            ))}
            <hr className="my-1 border-gray-200" />
            <Link href="/sign-in" role="menuitem" className={ITEM_CLASS} onClick={() => setOpen(false)}>
              <User className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
              Sign in
            </Link>
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Avatar button in the header; opens a small account dropdown. */
export function V2UserMenu() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const welcomeGuide = useV2WelcomeGuide();
  // Phones hide the bottom tab bar while the studio's book bar shows, so Home and Story book live here too.
  const nav = useVisibleNav(v2BottomNav);
  const phoneTabs = nav.items.filter((item) => item.href && (item.id === "home" || item.id === "storybook"));
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

  if (!user) return <GuestEntry />;

  const name = user.displayName || user.email.split("@")[0];
  // The admin overview, for any account that may open at least one admin page.
  const adminHref = ADMIN_PERMISSIONS.some((p) => user.permissions.includes(p)) ? "/admin" : null;

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
        <span className="hidden truncate text-xs font-semibold text-v2-navy sm:block lg:hidden xl:block">
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
            {phoneTabs.map((tab) => (
              <Link
                key={tab.id}
                href={tab.href!}
                role="menuitem"
                className={cn(ITEM_CLASS, "lg:hidden")}
                onClick={() => setOpen(false)}
              >
                <tab.icon className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
                {tab.label}
              </Link>
            ))}
            <Link
              href="/account"
              role="menuitem"
              className={ITEM_CLASS}
              onClick={() => setOpen(false)}
            >
              <CircleUser className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
              Account
            </Link>
            <Link
              href="/orders"
              role="menuitem"
              className={ITEM_CLASS}
              onClick={() => setOpen(false)}
            >
              <Package className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
              My orders
            </Link>
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
            <Link
              href="/activity"
              role="menuitem"
              className={ITEM_CLASS}
              onClick={() => setOpen(false)}
            >
              <ReceiptText
                className="h-4 w-4 shrink-0 text-v2-muted"
                aria-hidden
              />
              Transaction history
            </Link>
            {adminHref ? (
              <Link
                href={adminHref}
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
              Sign out
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
    let pendingEmail: string | null = null;
    if (nextEmail && nextEmail.toLowerCase() !== me.email.toLowerCase()) {
      const res = await api.adminUpdateUserEmail(me.id, nextEmail);
      if (api.isError(res)) {
        setError(res.error.message);
        setSaving(false);
        return;
      }
      if (res.data.pending) pendingEmail = res.data.email;
    }

    await refreshUser();
    setSaving(false);
    onClose();
    toast.success(
      pendingEmail
        ? {
            title: "Confirm your new email",
            message: `We sent a link to ${pendingEmail}. Your email changes once you click it.`,
          }
        : {
            title: "Profile updated",
            message: "Your changes have been saved.",
          },
    );
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
            autoComplete="name"
            autoCapitalize="words"
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
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
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
