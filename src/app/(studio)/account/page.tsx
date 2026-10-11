import { Suspense } from "react";
import type { Metadata } from "next";
import { V2AccountStudio } from "@/components/v2/account/V2AccountStudio";

export const metadata: Metadata = { title: "Account · ColorfulMemories" };

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <V2AccountStudio />
    </Suspense>
  );
}
