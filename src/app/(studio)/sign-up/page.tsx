import type { Metadata } from "next";
import { Suspense } from "react";
import { V2SignUpStudio } from "@/components/v2/auth/V2SignUpStudio";
import { getWelcomeFreeSheets } from "@/server/marketing/marketingNumbers";

// Same window as the landing pages, so the free sheets quoted here match theirs.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Create your account | Colorful Memories",
  alternates: { canonical: "/sign-up" },
};

export default async function SignUpPage() {
  const welcomeFreeSheets = await getWelcomeFreeSheets();
  return (
    <Suspense fallback={null}>
      <V2SignUpStudio welcomeFreeSheets={welcomeFreeSheets} />
    </Suspense>
  );
}
