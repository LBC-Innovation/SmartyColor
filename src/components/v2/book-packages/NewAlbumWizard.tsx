"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { useV2Toast } from "@/components/v2/V2Toast";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { PackagePay } from "@/components/v2/book-packages/PackagePay";
import { PackageReturn } from "@/components/v2/book-packages/PackageReturn";
import { PackageTiles, type PackagesLoad } from "@/components/v2/book-packages/PackageTiles";
import { ThemeStep } from "@/components/v2/book-packages/ThemeStep";
import { BOOK_PACKAGES, DESIGN_THEMES } from "@/content/marketing";
import { useAuth } from "@/context/AuthContext";
import { isError } from "@/lib/api/client";
import { fetchBookPackages } from "@/lib/bookPackages/client";
import { writePackageChoice } from "@/lib/bookPackages/choice";
import { fillPackageCopy, packageTokens } from "@/lib/bookPackages/copy";
import {
  PACKAGE_CHECKOUT_SESSION_PARAM,
  PACKAGE_CHOICE_KEY,
  isBookBindingId,
  type BookPackage,
  type BookPackagePurchase,
} from "@/lib/bookPackages/types";
import { sheetUsageCostCents } from "@/lib/credits/pricing";
import { CHECKOUT_SESSION_PARAM, CREDITS_RETURN_PARAM } from "@/lib/credits/types";
import * as library from "@/lib/library/client";
import { readTrackIntent } from "@/lib/marketing/copy";
import { usePriceList } from "@/lib/pricing/usePriceList";
import type { BookBindingId } from "@/lib/print/bookBindings";
import { trackFormat } from "@/lib/marketing/events";
import { track } from "@/lib/track";
import { STUDIO_PATH } from "@/lib/v2/guestSession";
import {
  FIRST_ALBUM_PARAM,
  claimStarterAlbum,
  dropStarterAlbum,
  markFirstAlbumChoice,
} from "@/lib/v2/firstAlbum";
import { markThemeDecided } from "@/components/v2/studio/themeDecided";
import {
  YEAR_ALBUM_PARAM,
  YEAR_ALBUM_PARAM_VALUE,
  attachYearAlbumIntent,
  clearYearAlbumIntent,
  readYearAlbumIntent,
  type YearAlbumIntent,
} from "@/lib/v2/yearAlbumIntent";

const CHOICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function albumHref(id: string): string {
  return `${STUDIO_PATH}?album=${encodeURIComponent(id)}`;
}

function readChoice(): BookBindingId | null {
  try {
    const raw = sessionStorage.getItem(PACKAGE_CHOICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { bindingId?: unknown; at?: unknown };
    if (!isBookBindingId(parsed.bindingId)) return null;
    if (typeof parsed.at !== "number" || Date.now() - parsed.at > CHOICE_MAX_AGE_MS) {
      sessionStorage.removeItem(PACKAGE_CHOICE_KEY);
      return null;
    }
    return parsed.bindingId;
  } catch {
    return null;
  }
}

function clearChoice() {
  try {
    sessionStorage.removeItem(PACKAGE_CHOICE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * /studio/new: "Start with the book". Step 1 picks a package (or "Print as you go"), step 2 pays
 * once (wallet or card), the return from Stripe confirms the payment, step 3 sets an optional
 * theme, and the album opens in the studio for its photos. "Print as you go" has nothing to pay,
 * so a signed-in person goes from step 1 straight to the theme (`flow=pages`). The step and the chosen book live in
 * the address, so sign-up, a reload and the phone Back button all keep their place.
 */
export function NewAlbumWizard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useV2Toast();
  const { user, loading: authLoading, refreshUser } = useAuth();
  const studio = useV2Studio();
  const prices = usePriceList();

  const signedIn = Boolean(user);
  const step = params.get("step");
  const bookParam = params.get("book");
  const albumParam = params.get("album");
  const flow = params.get("flow") === "pages" ? "pages" : "package";
  // Sent here straight from sign-up: the account's only album is the empty starter.
  const [firstAlbum] = useState(() => {
    if (params.get(FIRST_ALBUM_PARAM) !== "1") return false;
    markFirstAlbumChoice();
    return true;
  });
  // The home page's year album runs through here too. A plain "New album" (step 1 without the
  // year param) drops any year album left from earlier in this tab.
  const [yearAlbum] = useState<YearAlbumIntent | null>(() => {
    if (typeof window === "undefined") return null;
    const onStepOne = !step || step === "book";
    if (onStepOne && !bookParam && params.get(YEAR_ALBUM_PARAM) !== YEAR_ALBUM_PARAM_VALUE) {
      clearYearAlbumIntent();
      return null;
    }
    return readYearAlbumIntent();
  });
  // The cancel note is read once and then taken out of the address, so a reload doesn't repeat it.
  // A canceled card top-up (made to pay the rest of a package) reads the same as a canceled checkout.
  const [canceledParam] = useState(
    () => params.get("package") === "canceled" || (step === "pay" && params.get(CREDITS_RETURN_PARAM) === "canceled"),
  );
  // Back from a paid card top-up: the pay step finishes the purchase from credit.
  const [topUpReturn] = useState<{ sessionId: string } | null>(() => {
    if (step !== "pay" || params.get(CREDITS_RETURN_PARAM) !== "success") return null;
    const id = params.get(CHECKOUT_SESSION_PARAM);
    return id ? { sessionId: id } : null;
  });

  const [load, setLoad] = useState<PackagesLoad>({ status: "loading" });
  const [reloadTick, setReloadTick] = useState(0);
  const [creatingPages, setCreatingPages] = useState(false);
  const [canceledDismissed, setCanceledDismissed] = useState(false);
  const viewedRef = useRef(false);
  const redirectedRef = useRef(false);

  const pagePriceCents = signedIn ? sheetUsageCostCents(prices, "generation") : null;
  const editPriceCents = signedIn ? sheetUsageCostCents(prices, "edit", Number.MAX_SAFE_INTEGER) : null;

  // The Stripe return's session id and the remembered book are read once, then the session id is
  // taken out of the address bar so a reload doesn't repeat the return.
  const [sessionId] = useState(() => (step === "paid" ? (params.get(PACKAGE_CHECKOUT_SESSION_PARAM) ?? "") : ""));
  const [bindingHint] = useState<BookBindingId | null>(() => (typeof window === "undefined" ? null : readChoice()));
  useEffect(() => {
    if (step === "paid" && sessionId) {
      window.history.replaceState(null, "", `${pathname}?step=paid`);
    } else if (step === "paid") {
      router.replace("/studio/new");
    }
  }, [step, sessionId, pathname, router]);

  useEffect(() => {
    if (step !== "pay" || !isBookBindingId(bookParam)) return;
    if (topUpReturn) {
      window.history.replaceState(null, "", `${pathname}?book=${bookParam}&step=pay`);
      return;
    }
    if (!canceledParam) return;
    track("package_payment_canceled", { format: trackFormat(bookParam) });
    window.history.replaceState(null, "", `${pathname}?book=${bookParam}&step=pay`);
    // Once, when the page opens from a canceled payment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Catalog.
  useEffect(() => {
    let alive = true;
    void fetchBookPackages().then((res) => {
      if (!alive) return;
      setLoad(isError(res) ? { status: "error" } : { status: "ready", packages: res.data.packages });
    });
    return () => {
      alive = false;
    };
  }, [reloadTick]);

  const reload = useCallback(() => {
    setLoad({ status: "loading" });
    setReloadTick((t) => t + 1);
  }, []);

  const packages = useMemo(() => (load.status === "ready" ? load.packages : []), [load]);

  const onStepOne = !step || step === "book";

  // Analytics: tiles were shown.
  useEffect(() => {
    if (!onStepOne || load.status !== "ready" || packages.length === 0 || viewedRef.current) return;
    viewedRef.current = true;
    track("package_viewed", { count: packages.length, signed_in: signedIn, intent: readTrackIntent() });
  }, [onStepOne, load.status, packages.length, signedIn]);

  // A new account's starter album is still being made right after sign-up: wait for it, so the
  // choice uses it instead of racing it with a second album.
  const [pagesQueued, setPagesQueued] = useState(false);
  const justPages = useCallback(async () => {
    if (creatingPages) return;
    if (signedIn && firstAlbum && !studio.hydrated) {
      setPagesQueued(true);
      return;
    }
    setCreatingPages(true);
    track("album_started", { mode: "pages" });
    clearChoice();
    if (signedIn) {
      // A new account's empty starter album becomes this album, so no empty "Album 1" is left over.
      const starter = await claimStarterAlbum();
      if (starter) {
        if (yearAlbum?.albumName && yearAlbum.albumName !== starter.name) {
          await library.updateProject(starter.id, { name: yearAlbum.albumName });
          await studio.reload();
        }
        attachYearAlbumIntent(starter.id);
        router.replace(`/studio/new?step=theme&flow=pages&album=${encodeURIComponent(starter.id)}`);
        return;
      }
      const res = await library.createProject(yearAlbum?.albumName ?? `Album ${studio.projects.length + 1}`);
      if (isError(res)) {
        setCreatingPages(false);
        toast.error(res.error.message, "Couldn't create the album");
        return;
      }
      attachYearAlbumIntent(res.data.id);
      // Same path as a package: choose a theme first, then the album opens for its photos.
      router.replace(`/studio/new?step=theme&flow=pages&album=${encodeURIComponent(res.data.id)}`);
      return;
    }
    // Guests: a theme is kept with an account, so the album opens straight away.
    studio.createProject();
    router.replace(STUDIO_PATH);
  }, [creatingPages, signedIn, firstAlbum, studio, router, toast, yearAlbum]);
  const queuedRunRef = useRef(false);
  useEffect(() => {
    if (!pagesQueued || !studio.hydrated || queuedRunRef.current) return;
    queuedRunRef.current = true;
    void justPages();
  }, [pagesQueued, studio.hydrated, justPages]);

  // With nothing to sell (switch off, no priced package) "New album" behaves as it always did.
  useEffect(() => {
    if (!onStepOne || load.status !== "ready" || packages.length > 0 || authLoading) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    void justPages();
  }, [onStepOne, load.status, packages.length, authLoading, justPages]);

  // Step 1 with no book in the address: pick up a choice this browser remembers (a confirmation
  // email opened in another tab, a closed page). Never nags; only restores, and only once, when
  // the wizard opens on step 1. Coming back to step 1 from Pay (our Back or the browser's) means
  // "pick again", so it must not bounce the person forward to Pay.
  const openedOnStepOneRef = useRef(onStepOne && !bookParam);
  // Set when a tile pushed the Pay step in this visit, so Pay's Back can simply step back.
  const choseFromTilesRef = useRef(false);
  // Step 1 shown after Pay in this visit (any Back, ours or the browser's): forget the book, so a
  // reload doesn't jump forward to Pay again.
  const sawPayRef = useRef(false);
  useEffect(() => {
    if (step === "pay") sawPayRef.current = true;
    else if (onStepOne && sawPayRef.current) {
      sawPayRef.current = false;
      choseFromTilesRef.current = false;
      clearChoice();
    }
  }, [step, onStepOne]);
  const restoreCheckedRef = useRef(false);
  useEffect(() => {
    if (!onStepOne || bookParam || load.status !== "ready" || packages.length === 0) return;
    if (restoreCheckedRef.current) return;
    restoreCheckedRef.current = true;
    if (!openedOnStepOneRef.current) {
      clearChoice();
      return;
    }
    const remembered = readChoice();
    if (remembered && packages.some((p) => p.bindingId === remembered)) {
      router.replace(`/studio/new?book=${remembered}&step=pay`);
    }
  }, [onStepOne, bookParam, load.status, packages, router]);

  // ---- theme step: the album must be the signed-in person's ---------------------------------
  const [themeAlbum, setThemeAlbum] = useState<{ id: string; name: string; theme: string | null } | null>(null);
  useEffect(() => {
    if (step !== "theme" || authLoading) return;
    if (!user || !albumParam) {
      router.replace("/studio/new");
      return;
    }
    let alive = true;
    void library.listProjects().then((res) => {
      if (!alive) return;
      const found = !isError(res) ? res.data.find((p) => p.id === albumParam && p.role === "owner") : null;
      if (!found) {
        toast.error(DESIGN_THEMES.albumMissing);
        router.replace("/home");
        return;
      }
      setThemeAlbum({ id: found.id, name: found.name, theme: found.designTheme ?? null });
    });
    return () => {
      alive = false;
    };
  }, [step, authLoading, user, albumParam, router, toast]);

  // Back to step 1 when the chosen book isn't sold any more.
  const payPackage: BookPackage | null =
    step === "pay" && bookParam && isBookBindingId(bookParam)
      ? (packages.find((p) => p.bindingId === bookParam) ?? null)
      : null;
  useEffect(() => {
    if (step !== "pay" || load.status !== "ready") return;
    if (payPackage) return;
    clearChoice();
    toast.info(BOOK_PACKAGES.unavailable);
    router.replace("/studio/new");
  }, [step, load.status, payPackage, router, toast]);

  function onChoose(pkg: BookPackage) {
    track("package_selected", {
      format: trackFormat(pkg.bindingId),
      value: pkg.priceCents / 100,
      currency: "USD",
      from: "wizard",
    });
    writePackageChoice(pkg.bindingId);
    choseFromTilesRef.current = true;
    router.push(`/studio/new?book=${pkg.bindingId}&step=pay`);
  }

  // Step 1's Back leaves the wizard. Not history.back(): the entry behind step 1 can be an older
  // Pay step of this same wizard, which would bounce the person forward again.
  function goBack() {
    clearChoice();
    clearYearAlbumIntent();
    router.push(signedIn ? "/home" : STUDIO_PATH);
  }

  // A book bought on a new account comes with its own album: clear away the empty starter.
  const settleStarter = useCallback(
    (projectId: string) => {
      void dropStarterAlbum(projectId).then((dropped) => {
        if (dropped) void studio.reload({ activeProjectId: projectId });
      });
    },
    [studio],
  );

  function onPaid(purchase: BookPackagePurchase) {
    settleStarter(purchase.projectId);
    clearChoice();
    attachYearAlbumIntent(purchase.projectId);
    track("album_started", { mode: "package" });
    void refreshUser();
    toast.success({
      title: BOOK_PACKAGES.paidToastTitle,
      message:
        fillPackageCopy(
          purchase.shippingPrepaidCents > 0 ? BOOK_PACKAGES.paidToastBodyShipping : BOOK_PACKAGES.paidToastBody,
          packageTokens(purchase),
        ) ?? "",
    });
    router.replace(`/studio/new?step=theme&album=${encodeURIComponent(purchase.projectId)}`);
  }

  let content: React.ReactNode;
  if (step === "paid") {
    content = sessionId && !authLoading ? (
      <PackageReturn
        sessionId={sessionId}
        bindingHint={bindingHint}
        onContinue={(purchase) => {
          settleStarter(purchase.projectId);
          clearChoice();
          attachYearAlbumIntent(purchase.projectId);
          track("album_started", { mode: "package" });
          void refreshUser();
          router.replace(`/studio/new?step=theme&album=${encodeURIComponent(purchase.projectId)}`);
        }}
        onTryAgain={() => {
          const remembered = readChoice();
          router.replace(remembered ? `/studio/new?book=${remembered}&step=pay` : "/studio/new");
        }}
        onPickAnother={() => router.replace("/studio/new")}
        onAlbums={() => router.push("/home")}
      />
    ) : null;
  } else if (step === "theme") {
    content = themeAlbum ? (
      <ThemeStep
        key={themeAlbum.id}
        albumId={themeAlbum.id}
        initialTheme={themeAlbum.theme}
        flow={flow}
        onDone={(saved) => {
          markThemeDecided(themeAlbum.id);
          if (saved) toast.success({ message: DESIGN_THEMES.saved });
          router.replace(albumHref(themeAlbum.id));
        }}
      />
    ) : null;
  } else if (step === "pay") {
    content =
      authLoading ? null : load.status === "ready" && payPackage ? (
        <PackagePay
          pkg={payPackage}
          signedIn={signedIn}
          balanceCents={user?.creditsBalanceCents ?? null}
          pagePriceCents={pagePriceCents}
          editPriceCents={editPriceCents}
          canceledNote={canceledParam && !canceledDismissed}
          onDismissCanceled={() => setCanceledDismissed(true)}
          onBack={() => {
            // Going back is choosing again: forget the remembered book so step 1 stays put.
            clearChoice();
            // Came from the tiles in this visit: step back, so the Pay entry is behind us and
            // step 1's own Back leaves the wizard. Otherwise swap Pay for step 1 in place.
            if (choseFromTilesRef.current) {
              choseFromTilesRef.current = false;
              router.back();
            } else {
              router.replace("/studio/new");
            }
          }}
          onPaid={onPaid}
          albumName={yearAlbum?.albumName}
          topUpReturn={topUpReturn}
          onBalanceChanged={() => void refreshUser()}
          onUnavailable={() => {
            clearChoice();
            toast.info(BOOK_PACKAGES.unavailable);
            reload();
            router.replace("/studio/new");
          }}
          onReload={reload}
        />
      ) : load.status === "error" ? (
        <PackageTiles
          load={load}
          signedIn={signedIn}
          pagePriceCents={pagePriceCents}
          creatingPages={creatingPages || (pagesQueued && !studio.hydrated)}
          onChoose={onChoose}
          onJustPages={() => void justPages()}
          onRetry={reload}
          onBack={goBack}
          yearAlbum={yearAlbum}
        />
      ) : null;
  } else {
    content = (
      <PackageTiles
        load={load}
        signedIn={signedIn}
        pagePriceCents={pagePriceCents}
        creatingPages={creatingPages || (pagesQueued && !studio.hydrated)}
        onChoose={onChoose}
        onJustPages={() => void justPages()}
        onRetry={reload}
        onBack={firstAlbum ? undefined : goBack}
        yearAlbum={yearAlbum}
      />
    );
  }

  return (
    <V2StudioFrame hideBottomNav>
      <main className="flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-y-contain">{content}</main>
    </V2StudioFrame>
  );
}
