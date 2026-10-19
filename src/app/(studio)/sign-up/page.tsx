import type { Metadata } from "next";
import { Suspense } from "react";
import { V2SignUpStudio } from "@/components/v2/auth/V2SignUpStudio";

export const metadata: Metadata = {
  title: "Create your account | Colorful Memories",
  alternates: { canonical: "/sign-up" },
};

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <V2SignUpStudio />
    </Suspense>
  );
}
