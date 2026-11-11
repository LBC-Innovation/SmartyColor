import type { Metadata } from "next";
import { Suspense } from "react";
import { V2SignUpStudio } from "@/components/v2/auth/V2SignUpStudio";
import { getWelcomeCredit } from "@/server/marketing/marketingNumbers";

// Same window as the landing pages, so the credit quoted here matches theirs.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Create your account | Colorful Memories",
  alternates: { canonical: "/sign-up" },
};

export default async function SignUpPage() {
  const welcomeCreditCents = await getWelcomeCredit();
  return (
    <Suspense fallback={null}>
      <V2SignUpStudio welcomeCreditCents={welcomeCreditCents} />
    </Suspense>
  );
}
