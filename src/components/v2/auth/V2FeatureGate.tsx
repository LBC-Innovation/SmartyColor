"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { useAuth } from "@/context/AuthContext";
import {
  DEFAULT_FEATURE_ACCESS,
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
            <p className="text-sm font-semibold text-v2-ink">
              {featureLabel(feature)} isn&apos;t turned on for your account
            </p>
            <p className="text-sm text-v2-muted">
              {user
                ? "Access is granted one account at a time. Get in touch with us if you'd like it."
                : "Sign in to an account that has access to open it."}
            </p>
            {!user ? (
              <Link
                href="/sign-in"
                className="mt-2 inline-flex rounded-full bg-v2-primary px-5 py-2.5 text-sm font-semibold text-white"
              >
                Sign in
              </Link>
            ) : fallback ? (
              <Link
                href={fallback.href}
                className="mt-2 inline-flex rounded-full bg-v2-primary px-5 py-2.5 text-sm font-semibold text-white"
              >
                Go to {fallback.name}
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </V2StudioFrame>
  );
}
