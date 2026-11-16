"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Check, Gift, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { isError } from "@/lib/api/client";
import { listProjects } from "@/lib/library/client";
import type { LibraryProject } from "@/lib/library/types";
import { fetchPurchaseCodePreview, redeemPurchaseCode } from "@/lib/purchaseCodes/client";
import { bundleLines, normalizeCode, redeemPath, type PurchaseCodePreview } from "@/lib/purchaseCodes/types";
import { STUDIO_PATH } from "@/lib/v2/guestSession";
import { V2AuthHeading, V2AuthShell } from "@/components/v2/auth/V2AuthShell";

/** Query flag the studio opens with after a code is redeemed, to welcome the customer. */
export const REDEEMED_PARAM = "code";

function studioHref(albumId: string): string {
  return `${STUDIO_PATH}?album=${encodeURIComponent(albumId)}&${REDEEMED_PARAM}=redeemed`;
}

function Included({ preview }: { preview: PurchaseCodePreview }) {
  return (
    <ul className="mt-4 space-y-2 text-sm text-v2-ink">
      {bundleLines(preview.bundle).map((line) => (
        <li key={line} className="flex gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

function Message({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <V2AuthShell>
      <div className="v2-auth-card w-full max-w-md p-6 text-center sm:p-8">
        <V2AuthHeading className="v2-brand-title text-2xl text-v2-ink">{title}</V2AuthHeading>
        <div className="mt-3 text-sm leading-relaxed text-v2-muted">{children}</div>
        {action}
      </div>
    </V2AuthShell>
  );
}

/**
 * Where a purchase code's link (email, text or the QR code on a printed card) lands.
 * Signed out: what the code includes, then sign up or sign in and come back here.
 * Signed in: pick a new or existing album for it, then open that album in the studio.
 */
export function V2RedeemCode({ code }: { code: string }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [preview, setPreview] = useState<PurchaseCodePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [albums, setAlbums] = useState<LibraryProject[] | null>(null);
  const [target, setTarget] = useState<"new" | string>("new");
  const [albumName, setAlbumName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = redeemPath(code);

  // Ask again once the session is known: the answer says whether this caller already redeemed it.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    void fetchPurchaseCodePreview(code).then((res) => {
      if (cancelled) return;
      if (isError(res)) setLoadError(res.error.message);
      else {
        setPreview(res.data);
        setAlbumName((current) => current || `My ${res.data.campaign} book`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code, loading, user?.id]);

  useEffect(() => {
    if (!user || preview?.state !== "available") return;
    let cancelled = false;
    void listProjects().then((res) => {
      if (cancelled || isError(res)) return;
      setAlbums(res.data.filter((a) => a.role === "owner"));
    });
    return () => {
      cancelled = true;
    };
  }, [user, preview?.state]);

  async function onRedeem(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await redeemPurchaseCode(
      code,
      target === "new" ? { albumName: albumName.trim() || `My ${preview?.campaign ?? ""} book` } : { albumId: target },
    );
    if (isError(res)) {
      setBusy(false);
      setError(res.error.message);
      return;
    }
    router.replace(studioHref(res.data.albumId));
  }

  if (loadError) {
    return (
      <Message
        title="We couldn't find that code"
        action={
          <Link href="/redeem" className="v2-btn-primary mt-6 min-h-11 w-full py-3">
            Type the code in
          </Link>
        }
      >
        Check the code on your card or message. Codes look like CM-7KQ4-X9PD.
      </Message>
    );
  }

  if (loading || !preview) {
    return (
      <V2AuthShell>
        <p className="flex items-center gap-2 text-sm text-v2-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading…
        </p>
      </V2AuthShell>
    );
  }

  if (preview.state === "redeemed") {
    return preview.albumId ? (
      <Message
        title="Your code is ready to use"
        action={
          <Link href={studioHref(preview.albumId)} className="v2-btn-primary mt-6 min-h-11 w-full py-3">
            Open my book&apos;s album
          </Link>
        }
      >
        You&apos;ve already added this code to an album. Keep adding photos and making pages there.
      </Message>
    ) : (
      <Message
        title="This code has been used"
        action={
          user ? undefined : (
            <Link href={`/sign-in?next=${encodeURIComponent(here)}`} className="v2-btn-primary mt-6 min-h-11 w-full py-3">
              Sign in
            </Link>
          )
        }
      >
        {user
          ? "It was added to someone else's account. If you think that's a mistake, reply to the message the code came in."
          : "If you used it, sign in to see your album."}
      </Message>
    );
  }

  if (preview.state === "expired" || preview.state === "void") {
    return (
      <Message title={preview.state === "expired" ? "This code has expired" : "This code was canceled"}>
        Reply to the message the code came in and we&apos;ll sort it out.
      </Message>
    );
  }

  const heading = preview.recipientName ? `${preview.recipientName}, your coloring book is waiting` : "Your coloring book is waiting";

  return (
    <V2AuthShell>
      <div className="v2-auth-card w-full max-w-md p-6 sm:p-8">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-v2-primary-light text-v2-primary">
          <Gift className="h-6 w-6" aria-hidden />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-v2-muted">{preview.campaign}</p>
        <V2AuthHeading className="v2-brand-title mt-1 text-2xl text-v2-ink">{heading}</V2AuthHeading>
        {preview.note ? (
          <p className="mt-3 whitespace-pre-line rounded-xl bg-v2-primary-light px-4 py-3 text-sm text-v2-ink">{preview.note}</p>
        ) : null}
        <p className="mt-3 text-sm leading-relaxed text-v2-muted">
          Code <span className="font-mono font-semibold text-v2-ink">{preview.code}</span> is already paid for. It includes:
        </p>
        <Included preview={preview} />

        {!user ? (
          <>
            <p className="mt-5 text-sm leading-relaxed text-v2-muted">
              Create a free account to keep your photos and pages safe while you make your book.
            </p>
            <Link href={`/sign-up?next=${encodeURIComponent(here)}`} className="v2-btn-primary mt-4 min-h-11 w-full py-3">
              Create an account to start
            </Link>
            <Link href={`/sign-in?next=${encodeURIComponent(here)}`} className="v2-btn-outline mt-3 min-h-11 w-full py-3">
              I already have an account
            </Link>
          </>
        ) : (
          <form onSubmit={onRedeem} className="mt-6">
            <fieldset>
              <legend className="text-sm font-semibold text-v2-ink">Which album is this book for?</legend>
              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-v2-border p-3 has-[:checked]:border-v2-primary">
                <input
                  type="radio"
                  name="album"
                  className="mt-1"
                  checked={target === "new"}
                  onChange={() => setTarget("new")}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-v2-ink">A new album for this book</span>
                  {target === "new" ? (
                    <input
                      type="text"
                      value={albumName}
                      onChange={(e) => setAlbumName(e.target.value)}
                      maxLength={80}
                      aria-label="Album name"
                      className="v2-input mt-2 w-full"
                    />
                  ) : null}
                </span>
              </label>
              {(albums ?? []).map((album) => (
                <label
                  key={album.id}
                  className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-v2-border p-3 has-[:checked]:border-v2-primary"
                >
                  <input type="radio" name="album" checked={target === album.id} onChange={() => setTarget(album.id)} />
                  <span className="min-w-0 flex-1 truncate text-sm text-v2-ink">{album.name}</span>
                  <span className="shrink-0 text-xs text-v2-muted">
                    {album.photoCount} {album.photoCount === 1 ? "photo" : "photos"}
                  </span>
                </label>
              ))}
            </fieldset>
            {error ? (
              <p className="mt-3 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={busy} className="v2-btn-primary mt-5 min-h-11 w-full py-3">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BookOpen className="h-4 w-4" aria-hidden />}
              Start my book
            </button>
            <p className="mt-3 text-xs leading-relaxed text-v2-muted">
              The code can be used on one album. Anything beyond what&apos;s included is optional and is always marked as an
              extra cost before you pay for it.
            </p>
          </form>
        )}
      </div>
    </V2AuthShell>
  );
}

/** The code-entry form for a printed card's code typed by hand. */
export function V2RedeemEntry() {
  const router = useRouter();
  const [value, setValue] = useState("");
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const code = normalizeCode(value);
    if (code) router.push(redeemPath(code));
  }
  return (
    <V2AuthShell>
      <form onSubmit={onSubmit} className="v2-auth-card w-full max-w-md p-6 sm:p-8">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-v2-primary-light text-v2-primary">
          <Gift className="h-6 w-6" aria-hidden />
        </span>
        <V2AuthHeading className="v2-brand-title text-2xl text-v2-ink">Have a book code?</V2AuthHeading>
        <p className="mt-2 text-sm leading-relaxed text-v2-muted">Type the code from your card or message.</p>
        <label className="mt-5 block text-sm font-medium text-v2-ink" htmlFor="redeem-code">
          Code
        </label>
        <input
          id="redeem-code"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="CM-7KQ4-X9PD"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="v2-input mt-1 w-full font-mono uppercase tracking-wider"
        />
        <button type="submit" disabled={!normalizeCode(value)} className="v2-btn-primary mt-5 min-h-11 w-full py-3">
          Continue
        </button>
      </form>
    </V2AuthShell>
  );
}
