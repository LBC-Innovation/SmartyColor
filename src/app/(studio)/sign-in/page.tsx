import type { Metadata } from "next";
import { Suspense } from "react";
import { V2SignInStudio } from "@/components/v2/auth/V2SignInStudio";

export const metadata: Metadata = {
  title: "Sign in | Colorful Memories",
  alternates: { canonical: "/sign-in" },
};

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <V2SignInStudio />
    </Suspense>
  );
}
