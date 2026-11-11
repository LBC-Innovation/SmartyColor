"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { useAuth } from "@/context/AuthContext";
import {
  DEFAULT_FEATURE_ACCESS,
  STORY_MODE_PUBLIC,
  PRODUCT_FEATURES,
  featureLabel,
  type ProductFeature,
} from "@/lib/auth/features";

/**
 * Renders a product line only for accounts that have it turned on. Anyone else
 * is sent to the product line they do have, or told this one isn't available.
 */
export function V2FeatureGate({
  feature,
  children,
}: {
  feature: ProductFeature;
  children: ReactNode;
}) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const access = user?.features ?? DEFAULT_FEATURE_ACCESS;
  const allowed = access[feature];
  const fallback = PRODUCT_FEATURES.find((f) => f.key !== feature && access[f.key]);
  // The studio is the app's front door, so land people on what they can use instead of a notice.
  const redirectTo = !loading && !allowed && feature === "projects" ? fallback?.href : undefined;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (!loading && allowed) return <>{children}</>;

  return (
    <V2StudioFrame>
      <div className="flex flex-1 items-center justify-center px-4 pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {loading || redirectTo ? (
          <p className="flex items-center gap-2 text-sm text-v2-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading…
          </p>
        ) : (
          <div className="v2-panel flex max-w-md flex-col items-center gap-3 p-8 text-center">
            <Lock className="h-10 w-10 text-v2-muted" aria-hidden />
            <h1 className="text-base font-semibold text-v2-ink">
              {featureLabel(feature)} isn&apos;t open yet
            </h1>
            <p className="text-sm text-v2-muted">
              We&apos;re still getting it ready. Your albums and coloring pages are waiting in the studio.
            </p>
            <Link
              href={fallback?.href ?? (feature === "projects" ? "/" : "/studio")}
              className="v2-btn-primary mt-2 min-h-11"
            >
              {fallback ? `Go to ${fallback.name}` : feature === "projects" ? "Back to home" : "Go to my albums"}
            </Link>
            {!user && (feature !== "storybook" || STORY_MODE_PUBLIC) ? (
              <Link
                href="/sign-in"
                className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-v2-link hover:underline"
              >
                I already have an account
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </V2StudioFrame>
  );
}
